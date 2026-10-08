class_name LessonScreen
extends Screen
## One chapter of an NCERT book: Listen · Read · Hologram · Summary. Tabs sit at the bottom on phones and
## become a rail on the left when the screen is wider than tall. ☰ switches chapter, ⋯ holds the
## listening options.

const TABS := [["listen", "Listen"], ["read", "Read"], ["holo", "Hologram"], ["summary", "Summary"]]

var pack_id := ""
var ch_no := 1
var tab := "listen"
var pack := {}
var ch := {}
var ch_idx := -1
var key := ""
var info := {} # curriculum entry: subject, cls, chapter
var player: NotePlayer
var _frame: BoxContainer # rail + content, or content + bottom bar
var _tabbar: BoxContainer
var _content: Control
var _tab_nodes := {}
var _tab_btns := {}
var _rail := false


func _init(p: String, no: int, start_tab := "listen") -> void:
	pack_id = p
	ch_no = no
	tab = start_tab if start_tab in ["listen", "read", "holo", "summary"] else "listen"


func _ready() -> void:
	name = "Lesson"
	build("Opening…", "")
	add_action("menu", "Chapters", _chapters_sheet, "ChaptersBtn")
	add_action("more", "Listening options", _options_sheet, "OptionsBtn")
	player = NotePlayer.new()
	add_child(player)
	player.changed.connect(_update_sub)
	_content = Control.new()
	_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content.clip_contents = true
	_layout()
	var wait := UI.label("Opening the chapter…", 15, UI.MUTED)
	wait.name = "Wait"
	wait.set_anchors_preset(Control.PRESET_CENTER)
	_content.add_child(wait)
	pack = await App.load_pack(pack_id)
	if not is_instance_valid(self):
		return
	wait.queue_free()
	if pack.is_empty() or pack.get("chapters", []).is_empty():
		var err := UI.label("This chapter could not be loaded. Check the connection and try again.", 15, UI.BAD, null, true)
		err.set_anchors_preset(Control.PRESET_FULL_RECT)
		err.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		err.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_content.add_child(err)
		return
	var start := 0
	for i in pack.chapters.size():
		if int(pack.chapters[i].n) == ch_no:
			start = i
	select_chapter(start)


func on_hide() -> void:
	player.stop()


func on_resize() -> void:
	_layout()
	for n in _tab_nodes.values():
		if n.has_method("on_resize"):
			n.on_resize()


func _layout() -> void:
	var rail: bool = App.main.size.x > App.main.size.y
	if _frame and rail == _rail:
		return
	_rail = rail
	if _frame:
		_frame.remove_child(_content)
		_frame.queue_free()
	_frame = HBoxContainer.new() if rail else VBoxContainer.new()
	_frame.add_theme_constant_override("separation", 0)
	_frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_tabbar = VBoxContainer.new() if rail else HBoxContainer.new()
	_tabbar.add_theme_constant_override("separation", 2)
	var bar_panel := PanelContainer.new()
	var st := UI.sb(UI.PANEL, 0, UI.BORDER, 0, Vector4(6, 6, 6, 6))
	if rail:
		st.border_width_right = 1
		bar_panel.custom_minimum_size.x = 76
	else:
		st.border_width_top = 1
	bar_panel.add_theme_stylebox_override("panel", st)
	bar_panel.add_child(_tabbar)
	_tab_btns.clear()
	for t in TABS:
		var b := Button.new()
		b.name = "Tab_" + t[0]
		b.text = t[1]
		b.icon = UI.icon(t[0], 22)
		b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_size_override("font_size", 11)
		b.add_theme_font_override("font", UI.f_semi)
		b.custom_minimum_size = Vector2(64, 58)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if rail:
			b.size_flags_vertical = Control.SIZE_EXPAND_FILL
		b.pressed.connect(set_tab.bind(t[0]))
		_tabbar.add_child(b)
		_tab_btns[t[0]] = b
	if rail:
		_frame.add_child(bar_panel)
		_frame.add_child(_content)
	else:
		_frame.add_child(_content)
		_frame.add_child(bar_panel)
	body.add_child(_frame)
	_style_tabs()


func _style_tabs() -> void:
	var color := UI.subject_color(str(pack.get("subject", "physics")))
	for t in _tab_btns:
		var b: Button = _tab_btns[t]
		var on: bool = t == tab
		var bg := Color(color, 0.14) if on else Color(0, 0, 0, 0)
		var s := UI.sb(bg, 12, Color(0, 0, 0, 0), 0, Vector4(4, 6, 4, 4))
		UI._btn_styles(b, s, UI.sb(Color(1, 1, 1, 0.05) if not on else bg, 12, Color(0, 0, 0, 0), 0, Vector4(4, 6, 4, 4)), s)
		var c := color if on else UI.MUTED
		for k in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_hover_pressed_color"]:
			b.add_theme_color_override(k, c if not k.contains("hover") or on else UI.TEXT2)


func select_chapter(i: int) -> void:
	if pack.is_empty():
		return
	i = clampi(i, 0, pack.chapters.size() - 1)
	ch_idx = i
	ch = pack.chapters[i]
	ch_no = int(ch.n)
	key = App.chapter_key(pack_id, ch_no)
	info = App.find_chapter(pack_id, ch_no)
	var progress := App.chap(key)
	progress.notes = ch.notes.size()
	player.load_chapter(ch, key, bool(App.setting("key_only", false)))
	player.idx = clampi(int(progress.get("note", 0)), 0, player.list.size() - 1)
	for n in _tab_nodes.values():
		_content.remove_child(n)
		n.queue_free()
	_tab_nodes.clear()
	set_tab(tab, true)


func set_tab(t: String, force := false) -> void:
	if t == tab and not force and _tab_nodes.has(t):
		return
	tab = t
	if not _tab_nodes.has(t) and not ch.is_empty():
		var node: Control
		match t:
			"listen":
				node = ListenTab.new(self)
			"read":
				node = ReadTab.new(self)
			"holo":
				node = HoloTab.new(self)
			_:
				node = SummaryTab.new(self)
		node.name = "Pane_" + t
		node.set_anchors_preset(Control.PRESET_FULL_RECT)
		_content.add_child(node)
		_tab_nodes[t] = node
	for k in _tab_nodes:
		_tab_nodes[k].visible = k == t
	if _tab_nodes.has(t) and _tab_nodes[t].has_method("on_show"):
		_tab_nodes[t].on_show()
	_style_tabs()
	if key != "":
		App.touch_chapter(key, t)
	_update_sub()


func tab_node(t: String) -> Control:
	return _tab_nodes.get(t)


func _update_sub() -> void:
	if ch.is_empty():
		return
	var sub := ""
	match tab:
		"listen":
			var mins := 0
			for n in player.list:
				mins += int(n.get("w", 0))
			sub = "Listen · %d notes · ~%d min · %d heard" % [maxi(0, player.list.size() - 1), int(round(mins / 150.0 / float(App.setting("rate", 1.0)))), App.heard_count(key)]
		"read":
			var r: Control = _tab_nodes.get("read")
			sub = "Read · page %d of %d" % [r.page, int(ch.endPage)] if r else "Read"
		"holo":
			sub = "Hologram · " + pack.get("title", "")
		_:
			sub = "Summary · " + pack.get("title", "")
	set_titles("%d. %s" % [int(ch.n), ch.title], sub)


func subject_color() -> Color:
	return UI.subject_color(str(pack.get("subject", "physics")))


# ───────── sheets ─────────

func _chapters_sheet() -> void:
	if pack.is_empty():
		return
	var box := UI.vbox(6)
	box.name = "ChapterList"
	var color := subject_color()
	for i in pack.chapters.size():
		var c: Dictionary = pack.chapters[i]
		var k := App.chapter_key(pack_id, int(c.n))
		var tc := TapCard.new(12, UI.CARD2 if i == ch_idx else UI.CARD, 12, color if i == ch_idx else UI.BORDER)
		tc.name = "Ch%d" % int(c.n)
		var row := UI.hbox(10)
		row.add_child(UI.label(str(int(c.n)), 14, color, UI.f_mono))
		var t := UI.vbox(2)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.add_child(UI.label(c.title, 15, UI.TEXT, UI.f_semi, true))
		var pb := UI.bar(App.chapter_fraction(k), color, 3)
		t.add_child(pb)
		row.add_child(t)
		UI.box(tc).add_child(row)
		tc.tapped.connect(func() -> void:
			App.main.close_sheet()
			select_chapter(i))
		box.add_child(tc)
	App.main.open_sheet(pack.get("title", "Chapters"), box)


func _options_sheet() -> void:
	var box := UI.vbox(12)
	box.name = "Options"
	box.add_child(UI.eyebrow("Listening"))
	var flow := HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 8)
	flow.add_theme_constant_override("v_separation", 8)
	var key_only := UI.btn("Key points only", "chip_on" if App.setting("key_only", false) else "chip")
	key_only.name = "KeyOnly"
	key_only.pressed.connect(func() -> void:
		App.set_setting("key_only", not bool(App.setting("key_only", false)))
		App.main.close_sheet()
		select_chapter(ch_idx))
	flow.add_child(key_only)
	var auto := UI.btn("Auto-advance", "chip_on" if App.setting("auto_advance", true) else "chip")
	auto.name = "AutoAdvance"
	auto.pressed.connect(func() -> void:
		App.set_setting("auto_advance", not bool(App.setting("auto_advance", true)))
		UI.style_btn(auto, "chip_on" if App.setting("auto_advance", true) else "chip"))
	flow.add_child(auto)
	box.add_child(flow)
	box.add_child(UI.eyebrow("Speed"))
	var speeds := HFlowContainer.new()
	speeds.add_theme_constant_override("h_separation", 8)
	for r in [0.8, 0.9, 1.0, 1.15, 1.3, 1.5]:
		var b := UI.btn("%sx" % str(r), "chip_on" if is_equal_approx(float(App.setting("rate", 1.0)), r) else "chip")
		b.pressed.connect(func() -> void:
			App.set_setting("rate", r)
			for x in speeds.get_children():
				UI.style_btn(x, "chip")
			UI.style_btn(b, "chip_on"))
		speeds.add_child(b)
	box.add_child(speeds)
	box.add_child(UI.eyebrow("Voice"))
	if Speech.simulate or Speech.voices.is_empty():
		box.add_child(UI.label("No voice was found on this device, so notes are shown as text. Most phones and browsers include voices — check the system text-to-speech settings.", 13, UI.MUTED, null, true))
	else:
		var vlist := UI.vbox(6)
		var current := Speech.voice_id()
		for i in mini(Speech.voices.size(), 12):
			var v: Dictionary = Speech.voices[i]
			var b := UI.btn(Speech.voice_label(v), "chip_on" if v.id == current else "chip")
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
			b.pressed.connect(func() -> void:
				App.set_setting("voice", v.id)
				for x in vlist.get_children():
					UI.style_btn(x, "chip")
				UI.style_btn(b, "chip_on")
				Speech.speak("This is how your notes will sound."))
			vlist.add_child(b)
		box.add_child(vlist)
	box.add_child(UI.eyebrow("Text size"))
	var sizes := HFlowContainer.new()
	sizes.add_theme_constant_override("h_separation", 8)
	for z in [[0.9, "Small"], [1.0, "Normal"], [1.12, "Large"], [1.25, "Larger"]]:
		var b := UI.btn(z[1], "chip_on" if is_equal_approx(float(App.setting("text_size", 1.0)), z[0]) else "chip")
		b.pressed.connect(func() -> void:
			App.set_setting("text_size", z[0])
			App.main.close_sheet()
			App.main._on_resize())
		sizes.add_child(b)
	box.add_child(sizes)
	App.main.open_sheet("Options", box)
