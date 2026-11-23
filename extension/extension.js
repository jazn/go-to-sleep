// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Mateusz Niemojewski

// Go To Sleep - a GNOME Shell extension.
// During the night (start-hour .. end-hour) it shows an overlay with a
// question every snooze-minutes. Settings: schemas/*.gschema.xml, UI: prefs.js.
//   Yes -> the overlay goes away (and returns after snooze-minutes)
//   No  -> the screen is locked (like Super+L)

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const TICK_SECONDS = 10;

// Whether the hour of `date` falls within [start, end); the range may wrap
// around midnight. start == end is an empty range, i.e. no reminders.
function isNight(start, end, date = new Date()) {
    const h = date.getHours();
    return start > end
        ? h >= start || h < end
        : h >= start && h < end;
}

class Overlay {
    // One transparent container covering the whole desktop (for the modal
    // grab) holding, per monitor, a dimmed backdrop and a card sized to
    // sizeRatio of that monitor.
    constructor(iconPath, {sizeRatio, text, escCloses}, onYes, onNo) {
        this._iconPath = iconPath;
        this._sizeRatio = sizeRatio;
        this._text = text;
        this._onYes = onYes;
        this._onNo = onNo;

        this.actor = new St.Widget({
            reactive: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
            opacity: 0,
        });
        // Esc (if enabled in the settings) acts like "Yes".
        if (escCloses) {
            this.actor.connect('key-press-event', (_actor, event) => {
                if (event.get_key_symbol() !== Clutter.KEY_Escape)
                    return Clutter.EVENT_PROPAGATE;
                this._onYes();
                return Clutter.EVENT_STOP;
            });
        }
        this._build();

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this.actor.set_size(global.stage.width, global.stage.height);
            this._build();
            this._defaultButton?.grab_key_focus();
        });
    }

    _build() {
        this.actor.destroy_all_children();
        this._defaultButton = null;

        const primary = Main.layoutManager.primaryMonitor;
        for (const monitor of Main.layoutManager.monitors) {
            const {backdrop, no} = this._buildMonitor(monitor);
            this.actor.add_child(backdrop);
            if (monitor === primary || !this._defaultButton)
                this._defaultButton = no;
        }
    }

    _buildMonitor(monitor) {
        const cardW = Math.round(monitor.width * this._sizeRatio);
        const cardH = Math.round(monitor.height * this._sizeRatio);
        // Fonts scale with the card (at 80% of the monitor: 5% of its height).
        const fontPx = Math.max(18, Math.round(cardH * 0.0625));
        const iconSize = Math.round(Math.min(cardH * 0.36, cardW * 0.4));

        // Dimmed backdrop over the whole monitor; catches clicks.
        const backdrop = new St.Widget({
            style_class: 'gts-backdrop',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        });

        const card = new St.BoxLayout({
            style_class: 'gts-card',
            orientation: Clutter.Orientation.VERTICAL,
            width: cardW,
            height: cardH,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        backdrop.add_child(card);

        // Middle: picture + text.
        const middle = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'gts-middle',
        });
        card.add_child(middle);

        middle.add_child(new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(this._iconPath)),
            icon_size: iconSize,
            x_align: Clutter.ActorAlign.CENTER,
        }));

        const title = new St.Label({
            text: this._text,
            style_class: 'gts-title',
            style: `font-size: ${fontPx}px;`,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        title.clutter_text.line_wrap = true;
        title.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        title.clutter_text.line_alignment = Pango.Alignment.CENTER;
        middle.add_child(title);

        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        middle.add_child(new St.Label({
            text: _('It is %s.').format(`${hh}:${mm}`),
            style_class: 'gts-sub',
            style: `font-size: ${Math.round(fontPx * 0.5)}px;`,
            x_align: Clutter.ActorAlign.CENTER,
        }));

        // Bottom: buttons.
        const buttons = new St.BoxLayout({
            style_class: 'gts-buttons',
            x_align: Clutter.ActorAlign.CENTER,
        });
        card.add_child(buttons);

        const btnStyle = `font-size: ${Math.round(fontPx * 0.55)}px;`;
        const yes = new St.Button({
            label: _('Yes'),
            style_class: 'gts-btn gts-btn-yes',
            style: btnStyle,
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        const no = new St.Button({
            label: _('No'),
            style_class: 'gts-btn gts-btn-no',
            style: btnStyle,
            can_focus: true,
            reactive: true,
            track_hover: true,
        });
        yes.connect('clicked', () => this._onYes());
        no.connect('clicked', () => this._onNo());
        buttons.add_child(yes);
        buttons.add_child(no);

        return {backdrop, no};
    }

    open() {
        Main.layoutManager.modalDialogGroup.add_child(this.actor);
        try {
            this._grab = Main.pushModal(this.actor, {
                actionMode: Shell.ActionMode.SYSTEM_MODAL,
            });
        } catch (e) {
            console.warn(`go-to-sleep: pushModal failed: ${e}`);
            this._grab = null;
        }
        this._defaultButton?.grab_key_focus();
        this.actor.ease({
            opacity: 255,
            duration: 400,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close({animate}) {
        if (!this.actor)
            return;
        const actor = this.actor;
        this.actor = null;

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        if (this._grab) {
            try {
                Main.popModal(this._grab);
            } catch (e) {
                console.warn(`go-to-sleep: popModal failed: ${e}`);
            }
            this._grab = null;
        }

        if (animate) {
            actor.ease({
                opacity: 0,
                duration: 250,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => actor.destroy(),
            });
        } else {
            actor.destroy();
        }
    }
}

export default class GoToSleepExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        // State survives the disable()/enable() the shell does around screen lock.
        this._nextShow = 0;
        this._overlay = null;
        this._manual = false;
    }

    enable() {
        this._iconPath = GLib.build_filenamev([this.path, 'moon.svg']);

        this._settings = this.getSettings();

        // The first check happens only after TICK_SECONDS so the shell can
        // finish starting up before a modal overlay appears at login.
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });

        // Keyboard shortcut (default Super+Shift+Z) showing the overlay on demand.
        Main.wm.addKeybinding(
            'show-shortcut',
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._show({manual: true}));
    }

    disable() {
        Main.wm.removeKeybinding('show-shortcut');
        this._settings = null;
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._hide({animate: false});
        this._iconPath = null;
    }

    _tick() {
        const now = new Date();

        if (!isNight(this._settings.get_int('start-hour'),
            this._settings.get_int('end-hour'), now)) {
            // Outside the time range: hide the overlay and reset the snooze.
            this._nextShow = 0;
            if (!this._manual)
                this._hide({animate: true});
            return;
        }

        if (this._overlay)
            return;
        if (Main.screenShield?.locked)
            return;
        if (now.getTime() < this._nextShow)
            return;

        this._show();
    }

    _show({manual = false} = {}) {
        if (this._overlay || !Main.layoutManager.primaryMonitor)
            return;
        this._manual = manual;

        this._overlay = new Overlay(
            this._iconPath,
            {
                sizeRatio: this._settings.get_int('size-percent') / 100,
                text: this._settings.get_string('message') ||
                    _('Are you doing something more meaningful than sleeping right now?'),
                escCloses: this._settings.get_boolean('esc-closes'),
            },
            () => this._answerYes(),
            () => this._answerNo());
        this._overlay.open();
    }

    _hide({animate}) {
        if (!this._overlay)
            return;
        const overlay = this._overlay;
        this._overlay = null;
        this._manual = false;
        overlay.close({animate});
    }

    _snooze() {
        this._nextShow = Date.now() + this._settings.get_int('snooze-minutes') * 60 * 1000;
    }

    _answerYes() {
        this._snooze();
        this._hide({animate: true});
    }

    _answerNo() {
        this._snooze();
        this._hide({animate: false});
        if (Main.screenShield)
            Main.screenShield.lock(true);
        else
            GLib.spawn_command_line_async('loginctl lock-session');
    }
}
