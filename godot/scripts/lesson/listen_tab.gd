class_name ListenTab
extends Control
## Listen: the note being read (word highlighted), the controls, and the chapter's notes grouped by
## section — tap a section to open it, ▶ to play it from the start. Side by side when wide.

var lesson: LessonScreen
var player: NotePlayer
var _split: BoxContainer
var _now: PanelContainer
var _hud: Label
var _text: RichTextLabel
var _heard_btn: Button
var _count: Label
var _progress: ProgressBar
var _play: Button
var _page_btn: Button
var _list: VBoxContainer
var _list_scroll: ScrollContainer
var _groups: Array = [] # [{key, num, title, idx: []}]
var _open := {} # section keys open
var _word := Vector2i(-1, -1)
var _rendered_idx := -1
var _wide := false


func _init(l: LessonScreen) -> void:
	lesson = l
	player = l.player


func _ready() -> void:
	_build()
	player.changed.connect(_refresh)
	player.word.connect(_on_word)
	_rebuild_list()
	_refresh()


func on_resize() -> void:
	var wide: bool = App.main.size.x > App.main.size.y or App.main.size.x >= 820
	if wide != _wide:
		UI.clear(self)
		_build()
		_rebuild_list()
		_rendered_idx = -1
		_refresh()


func on_show() -> void:
	_refresh()
	_scroll_to_current()


func _build() -> void:
	_wide = App.main.size.x > App.main.size.y or App.main.size.x >= 820
	var color := lesson.subject_color()
	_split = HBoxContainer.new() if _wide else VBoxContainer.new()
	_split.set_anchors_preset(Control.PRESET_FULL_RECT)
	_split.add_theme_constant_override("separation", 0)
	add_child(_split)
	# ── the player: note card + controls
	var playercol := UI.vbox(10)
	playercol.name = "Player"
	_now = PanelContainer.new()
	_now.add_theme_stylebox_override("panel", UI.sb(UI.CARD, 16, UI.BORDER, 1, Vector4(16, 12, 16, 14)))
	_now.size_flags_vertical = Control.SIZE_EXPAND_FILL if _wide else Control.SIZE_FILL
	var nb := UI.vbox(8)
	var hud_row := UI.hbox(8)
	_hud = UI.line("", 11, color, UI.f_mono)
	hud_row.add_child(_hud)
	_heard_btn = UI.btn("Mark heard", "chip", "check", UI.GOOD)
	_heard_btn.name = "MarkHeard"
	_heard_btn.custom_minimum_size.y = 32
	_heard_btn.add_theme_font_size_override("font_size", 12)
	_heard_btn.pressed.connect(func() -> void: player.mark(player.idx))
	hud_row.add_child(_heard_btn)
	nb.add_child(hud_row)
	var tscroll := ScrollContainer.new()
	tscroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	tscroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	tscroll.custom_minimum_size.y = 156 if not _wide else 80
	_text = UI.rich(19, UI.TEXT)
	_text.name = "NowText"
	_text.add_theme_constant_override("line_separation", 8)
	tscroll.add_child(_text)
	nb.add_child(tscroll)
	_now.add_child(nb)
	playercol.add_child(_now)
	var prow := UI.hbox(10)
	_count = UI.label("", 11, UI.MUTED, UI.f_mono)
	prow.add_child(_count)
	_progress = UI.bar(0, color, 4)
	_progress.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	prow.add_child(_progress)
	playercol.add_child(prow)
	var transport := UI.hbox(8)
	transport.alignment = BoxContainer.ALIGNMENT_CENTER
	var again := UI.icon_btn("replay", "Play this note again", 48, "card")
	again.name = "Again"
	again.pressed.connect(func() -> void: player.play(player.idx))
	transport.add_child(again)
	transport.add_child(UI.spacer(4))
	var prev := UI.icon_btn("prev", "Previous note", 52, "card")
	prev.name = "Prev"
	prev.pressed.connect(player.prev)
	transport.add_child(prev)
	_play = UI.icon_btn("play", "Play", 68, "card", 28)
	_play.name = "Play"
	var round_n := UI.sb(Color("#e5e9f0"), 34, Color(0, 0, 0, 0), 0, Vector4())
	UI._btn_styles(_play, round_n, UI.sb(Color.WHITE, 34, Color(0, 0, 0, 0), 0, Vector4()), UI.sb(Color("#cfd5df"), 34, Color(0, 0, 0, 0), 0, Vector4()))
	for k in ["icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_hover_pressed_color"]:
		_play.add_theme_color_override(k, Color("#0f1115"))
	_play.pressed.connect(player.toggle)
	transport.add_child(_play)
	var nxt := UI.icon_btn("next", "Next note", 52, "card")
	nxt.name = "Next"
	nxt.pressed.connect(player.next)
	transport.add_child(nxt)
	transport.add_child(UI.spacer(4))
	_page_btn = UI.btn("p. 1", "card", "read")
	_page_btn.name = "PageBtn"
	_page_btn.custom_minimum_size = Vector2(48, 48)
	_page_btn.add_theme_font_size_override("font_size", 13)
	_page_btn.tooltip_text = "Open this page in Read"
	_page_btn.pressed.connect(func() -> void:
		var n := player.note()
		lesson.set_tab("read")
		var r = lesson.tab_node("read")
		if r and not n.is_empty():
			r.go_page(int(n.p)))
	transport.add_child(_page_btn)
	playercol.add_child(transport)
	# ── the notes, grouped by section
	_list = UI.vbox(4)
	_list.name = "Notes"
	_list_scroll = ScrollContainer.new()
	_list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_list_scroll.scroll_deadzone = 10
	_list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var list_pad := UI.pad(_list, 10, 8, 10, 16)
	list_pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL # the list takes the full width
	_list_scroll.add_child(list_pad)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if _wide:
		var left := PanelContainer.new()
		var ls := UI.sb(UI.PANEL.lerp(UI.BG, 0.5), 0, UI.BORDER, 0, Vector4())
		ls.border_width_right = 1
		left.add_theme_stylebox_override("panel", ls)
		left.custom_minimum_size.x = clampf(App.main.size.x * 0.38, 260, 420)
		left.add_child(_list_scroll)
		_split.add_child(left)
		var right := UI.pad(playercol, 16, 14, 16, 14)
		right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_split.add_child(right)
	else:
		_split.add_child(UI.pad(playercol, 12, 12, 12, 8))
		var sep := ColorRect.new()
		sep.color = UI.BORDER
		sep.custom_minimum_size.y = 1
		_split.add_child(sep)
		_split.add_child(_list_scroll)


# ───────── note list ─────────

func _make_groups() -> void:
	_groups = []
	var by := {}
	var ch: Dictionary = lesson.ch
	var key_only := bool(App.setting("key_only", false))
	for i in player.list.size():
		var n: Dictionary = player.list[i]
		if n.get("intro", false):
			continue
		var k := "key" if key_only else str(n.s)
		if not by.has(k):
			var raw := "Key points" if key_only else "Chapter text"
			if not key_only and int(n.s) >= 0 and int(n.s) < ch.sections.size():
				raw = ch.sections[int(n.s)].t
			var num := ""
			var title := raw
			var rx := RegEx.create_from_string("^(\\d+(?:\\.\\d+)*)\\.?\\s+(.+)$")
			var m := rx.search(raw)
			if m:
				num = m.get_string(1)
				title = m.get_string(2)
			else:
				num = "★" if key_only else "§%d" % (_groups.size() + 1)
			by[k] = {"key": k, "num": num, "title": title, "idx": []}
			_groups.append(by[k])
		by[k].idx.append(i)


func _group_of(i: int) -> Dictionary:
	for g in _groups:
		if i in g.idx:
			return g
	return {}


func _rebuild_list() -> void:
	_make_groups()
	UI.clear(_list)
	var g := _group_of(player.idx)
	if not g.is_empty():
		_open[g.key] = true
	if not player.list.is_empty() and player.list[0].get("intro", false):
		_list.add_child(_note_row(0))
	for grp in _groups:
		_list.add_child(_group_node(grp))


func _group_node(g: Dictionary) -> Control:
	var color := lesson.subject_color()
	var wrap := UI.vbox(2)
	wrap.name = "Sec_" + str(g.key).replace(".", "_")
	var head := UI.hbox(4)
	var toggle := TapCard.new(10, Color(0, 0, 0, 0), 10, Color(0, 0, 0, 0))
	toggle.name = "Toggle"
	toggle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var row := UI.hbox(8)
	var is_open: bool = _open.has(g.key)
	var chev := UI.icon_rect("down" if is_open else "chev", 16, color if is_open else UI.MUTED)
	row.add_child(chev)
	row.add_child(UI.label(g.num, 12, color, UI.f_mono))
	var cur: bool = player.idx in g.idx
	row.add_child(UI.line(g.title, 14, UI.TEXT if cur else UI.TEXT2, UI.f_semi))
	var heard := 0
	for i in g.idx:
		if player.is_heard(i):
			heard += 1
	var done: bool = heard == g.idx.size()
	var pill := PanelContainer.new()
	pill.add_theme_stylebox_override("panel", UI.sb(Color(0, 0, 0, 0), 999, Color(UI.GOOD, 0.5) if done else UI.BORDER2, 1, Vector4(8, 1, 8, 1)))
	pill.add_child(UI.label(("✓ " if done else "") + "%d/%d" % [heard, g.idx.size()], 11, UI.GOOD if done else UI.MUTED, UI.f_mono))
	row.add_child(pill)
	UI.box(toggle).add_child(row)
	head.add_child(toggle)
	var play := UI.icon_btn("play", "Play this section", 40, "ghost", 16)
	play.name = "PlaySec"
	play.pressed.connect(func() -> void: player.play(g.idx[0]))
	head.add_child(play)
	wrap.add_child(head)
	var notes := UI.vbox(2)
	notes.name = "NotesBox"
	var nw := UI.pad(notes, 22, 0, 0, 6)
	nw.name = "NotesWrap"
	wrap.add_child(nw)
	nw.visible = is_open
	if is_open:
		for i in g.idx:
			notes.add_child(_note_row(i))
	toggle.tapped.connect(func() -> void:
		var now_open := not _open.has(g.key)
		if now_open:
			_open[g.key] = true
		else:
			_open.erase(g.key)
		chev.texture = UI.icon("down" if now_open else "chev", 16)
		chev.modulate = color if now_open else UI.MUTED
		notes.get_parent().visible = now_open
		if now_open and notes.get_child_count() == 0:
			for i in g.idx:
				notes.add_child(_note_row(i)))
	return wrap


func _note_row(i: int) -> Control:
	var n: Dictionary = player.list[i]
	var on: bool = i == player.idx
	var c := TapCard.new(8, Color(lesson.subject_color(), 0.12) if on else Color(0, 0, 0, 0), 10, Color(lesson.subject_color(), 0.4) if on else Color(0, 0, 0, 0))
	c.name = "Note%d" % i
	var row := UI.hbox(8)
	var intro: bool = n.get("intro", false)
	var num := UI.label("◈" if intro else "%02d" % i, 11, UI.MUTED, UI.f_mono)
	num.custom_minimum_size.x = 22
	num.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(num)
	var t := UI.label("Chapter briefing — what this chapter covers" if intro else str(n.t), 13, UI.TEXT if on else UI.TEXT2, null, true)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.max_lines_visible = 2
	t.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	row.add_child(t)
	if player.is_heard(i):
		row.add_child(UI.label("✓", 13, UI.GOOD, UI.f_bold))
	UI.box(c).add_child(row)
	c.tapped.connect(func() -> void: player.play(i))
	return c


func _scroll_to_current() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	if not is_instance_valid(_list):
		return
	var n := _list.find_child("Note%d" % player.idx, true, false)
	if n and n is Control and n.is_visible_in_tree():
		_list_scroll.ensure_control_visible(n)


# ───────── now playing ─────────

func _refresh() -> void:
	if not is_instance_valid(_text) or player.list.is_empty():
		return
	var n := player.note()
	var g := _group_of(player.idx)
	var hud := ""
	if n.get("intro", false):
		hud = "CHAPTER BRIEFING"
	elif not g.is_empty():
		hud = "%s · NOTE %d OF %d" % [g.num, g.idx.find(player.idx) + 1, g.idx.size()]
	hud += " · PAGE %d" % int(n.get("p", 0))
	_hud.text = hud
	var heard := player.is_heard(player.idx)
	_heard_btn.visible = not n.get("intro", false)
	_heard_btn.text = "Heard" if heard else "Mark heard"
	UI.style_btn(_heard_btn, "chip_on" if heard else "chip", UI.GOOD)
	_count.text = "%d / %d" % [player.idx, player.list.size() - 1]
	_progress.value = float(player.idx) / maxf(1, player.list.size() - 1)
	var playing: bool = player.playing and not player.paused
	_play.icon = UI.icon("pause" if playing else "play", 28)
	_play.tooltip_text = "Pause" if playing else "Play"
	_page_btn.text = "p. %d" % int(n.get("p", 0))
	if _rendered_idx != player.idx:
		_rendered_idx = player.idx
		_word = Vector2i(-1, -1)
		_render_text()
		# the list follows the reading: rebuild row states, open the current section
		_rebuild_list()
		_scroll_to_current()
	elif not playing:
		_word = Vector2i(-1, -1)
		_render_text()


func _render_text() -> void:
	var t := str(player.note().get("t", ""))
	if _word.x < 0 or _word.x >= t.length():
		_text.text = UI.esc(t)
		return
	var hi := lesson.subject_color().to_html(false)
	_text.text = UI.esc(t.substr(0, _word.x)) + "[bgcolor=#%s40][color=#ffffff]" % hi + UI.esc(t.substr(_word.x, _word.y - _word.x)) + "[/color][/bgcolor]" + UI.esc(t.substr(_word.y))


func _on_word(a: int, b: int) -> void:
	if not visible:
		return
	var w := Vector2i(a, b)
	if w != _word:
		_word = w
		_render_text()
