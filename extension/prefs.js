// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Mateusz Niemojewski

// Go To Sleep preferences window (GNOME 45+). It runs in a separate process,
// so it may use Gtk/Adw but not Clutter/St/Meta/Shell.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SHORTCUT_KEY = 'show-shortcut';

export default class GoToSleepPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keeps the settings alive together with the window

        const page = new Adw.PreferencesPage({
            title: 'Go To Sleep',
            icon_name: 'weather-clear-night-symbolic',
        });
        window.add(page);

        // --- Schedule ---
        const schedule = new Adw.PreferencesGroup({
            title: _('Schedule'),
            description: _('Hours are 0-23. Equal start and end hours mean no reminders.'),
        });
        page.add(schedule);
        schedule.add(this._spinRow(settings, 'start-hour', _('From hour'), 0, 23, 1));
        schedule.add(this._spinRow(settings, 'end-hour', _('To hour'), 0, 23, 1));
        schedule.add(this._spinRow(settings, 'snooze-minutes', _('Interval (minutes)'), 1, 240, 1));

        // --- Appearance ---
        const look = new Adw.PreferencesGroup({title: _('Appearance')});
        page.add(look);
        look.add(this._spinRow(settings, 'size-percent', _('Window size (% of monitor)'), 30, 100, 5));

        const message = new Adw.EntryRow({title: _('Question text (empty = default)')});
        settings.bind('message', message, 'text', Gio.SettingsBindFlags.DEFAULT);
        look.add(message);

        const esc = new Adw.SwitchRow({
            title: _('Esc closes the window'),
            subtitle: _('Acts like the "Yes" button. Off by default.'),
        });
        settings.bind('esc-closes', esc, 'active', Gio.SettingsBindFlags.DEFAULT);
        look.add(esc);

        // --- Shortcut ---
        const keys = new Adw.PreferencesGroup({title: _('Keyboard shortcut')});
        page.add(keys);
        keys.add(this._shortcutRow(settings, window));
    }

    _spinRow(settings, key, title, min, max, step) {
        const row = new Adw.SpinRow({
            title,
            adjustment: new Gtk.Adjustment({
                lower: min, upper: max, step_increment: step, page_increment: step * 5,
            }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _shortcutRow(settings, window) {
        const row = new Adw.ActionRow({
            title: _('Show the window now'),
            subtitle: _('Click and press a new shortcut. Backspace clears it, Esc cancels.'),
            activatable: true,
        });

        const label = new Gtk.ShortcutLabel({
            accelerator: settings.get_strv(SHORTCUT_KEY)[0] ?? '',
            disabled_text: _('No shortcut'),
            valign: Gtk.Align.CENTER,
        });
        row.add_suffix(label);

        const changedId = settings.connect(`changed::${SHORTCUT_KEY}`, () => {
            label.accelerator = settings.get_strv(SHORTCUT_KEY)[0] ?? '';
        });
        window.connect('close-request', () => {
            settings.disconnect(changedId);
            return false;
        });

        row.connect('activated', () => this._captureShortcut(settings, window));
        return row;
    }

    _captureShortcut(settings, parent) {
        const dialog = new Adw.Window({
            modal: true,
            transient_for: parent,
            default_width: 380,
            default_height: 320,
            resizable: false,
        });
        dialog.set_content(new Adw.StatusPage({
            icon_name: 'input-keyboard-symbolic',
            title: _('Press a new shortcut'),
            description: _('Esc cancels, Backspace clears the shortcut.'),
        }));

        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (_c, keyval, keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();

            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                settings.set_strv(SHORTCUT_KEY, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            // A lone modifier (Ctrl, Shift...) or an invalid combination: keep waiting.
            if (!Gtk.accelerator_valid(keyval, mask))
                return Gdk.EVENT_STOP;

            const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
            settings.set_strv(SHORTCUT_KEY, [accel]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(keyController);
        dialog.present();
    }
}
