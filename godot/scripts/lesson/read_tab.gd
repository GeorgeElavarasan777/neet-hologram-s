class_name ReadTab
extends Control
## Read: the chapter page by page. Key terms are underlined — tap one for its meaning. The floating
## control turns pages, shows the section and reads the page aloud (the page follows the voice).

var lesson: LessonScreen
var page := 1
var pages: Array = [] # page numbers that have text
var _scroll: ScrollContainer
var _col: VBoxContainer
var _page_l: Label
var _sec_l: Label
var _play: Button
var _terms: Array = [] # [{t, d, p, rx}]


func _init(l: LessonScreen) -> void:
	lesson = l


func _ready() -> void:
	var seen := {}
	for b in lesson.ch.blocks:
		if not seen.has(int(b.p)):
			seen[int(b.p)] = true
			pages.append(int(b.p))
	pages.sort()
	if pages.is_empty():
		pages = [int(lesson.ch.startPage)]
	for t in lesson.ch.terms.slice(0, 40):
		var word := str(t.t)
		if word.length() < 3:
			continue
		var rx := RegEx.create_from_string("(?i)\\b(" + _rx_escape(word) + ")\\b")
		if rx and rx.is_valid():
			_terms.append({"t": word, "d": str(t.get("d", "")), "p": int(t.get("p", 0)), "rx": rx})
	_scroll = ScrollContainer.new()
	_scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.scroll_deadzone = 10
	add_child(_scroll)
	var center := CenterColumn.new()
	center.max_width = 760
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_col = UI.vbox(14)
	_col.name = "Page"
	center.add_child(UI.pad(_col, 20, 18, 20, 120))
	_scroll.add_child(center)
	_build_control()
	var saved := int(App.chap(lesson.key).get("page", 0))
	go_page(saved if saved in pages else pages[0])
	lesson.player.changed.connect(_follow)


func on_show() -> void:
	_update_play()


func _rx_escape(s: String) -> String:
	var out := ""
	for c in s:
		out += ("\\" + c) if c in ".^$*+?()[]{}|\\/" else c
	return out


## the floating page control (‹ · page + section · ▶ · ›)
func _build_control() -> void:
	var pill := PanelContainer.new()
	pill.name = "PageControl"
	pill.add_theme_stylebox_override("panel", UI.sb(Color(UI.CARD2, 0.97), 999, UI.BORDER2, 1, Vector4(6, 6, 6, 6)))
	pill.anchor_left = 0.5
	pill.anchor_right = 0.5
	pill.anchor_top = 1.0
	pill.anchor_bottom = 1.0
	pill.grow_horizontal = Control.GROW_DIRECTION_BOTH
	pill.grow_vertical = Control.GROW_DIRECTION_BEGIN
	pill.offset_bottom = -14
	var row := UI.hbox(6)
	var prev := UI.icon_btn("back", "Previous page", 48)
	prev.name = "PrevPage"
	prev.pressed.connect(func() -> void: turn(-1))
	row.add_child(prev)
	var mid := UI.vbox(0)
	mid.custom_minimum_size.x = 150
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	_page_l = UI.label("", 13, UI.TEXT, UI.f_mono)
	_page_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sec_l = UI.line("", 11, UI.MUTED, UI.f_med)
	_sec_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_sec_l.custom_minimum_size.x = 150
	mid.add_child(_page_l)
	mid.add_child(_sec_l)
	row.add_child(mid)
	_play = UI.icon_btn("play", "Read this page aloud", 52, "card", 24)
	_play.name = "ReadAloud"
	UI._btn_styles(_play, UI.sb(Color("#e5e9f0"), 26, Color(0, 0, 0, 0), 0, Vector4()), UI.sb(Color.WHITE, 26, Color(0, 0, 0, 0), 0, Vector4()), UI.sb(Color("#cfd5df"), 26, Color(0, 0, 0, 0), 0, Vector4()))
	for k in ["icon_normal_color", "icon_hover_color", "icon_pressed_color", "icon_hover_pressed_color"]:
		_play.add_theme_color_override(k, Color("#0f1115"))
	_play.pressed.connect(_read_aloud)
	row.add_child(_play)
	var nxt := UI.icon_btn("chev", "Next page", 48)
	nxt.name = "NextPage"
	nxt.pressed.connect(func() -> void: turn(1))
	row.add_child(nxt)
	pill.add_child(row)
	add_child(pill)


func turn(d: int) -> void:
	var i := pages.find(page)
	var j := clampi(i + d, 0, pages.size() - 1)
	if j != i:
		go_page(pages[j])


func go_page(p: int) -> void:
	if not p in pages:
		for q in pages:
			if q >= p:
				p = q
				break
	page = p
	App.chap(lesson.key).page = p
	App.save()
	_render()
	_scroll.scroll_vertical = 0
	lesson._update_sub()


func _section_for_page() -> String:
	var secs: Array = lesson.ch.sections
	for s in secs: # the section the page starts with
		if int(s.p) == page:
			return s.t
	var best := ""
	for s in secs:
		if int(s.p) < page:
			best = s.t
	return best if best != "" else "Chapter %d" % int(lesson.ch.n)


func _render() -> void:
	UI.clear(_col)
	var color := lesson.subject_color()
	var used := {}
	for b in lesson.ch.blocks:
		if int(b.p) != page:
			continue
		if b.k == "h2":
			var h := UI.label(str(b.t), 21, UI.TEXT, UI.f_bold, true)
			h.add_theme_constant_override("line_spacing", 2)
			_col.add_child(UI.spacer(0, 4))
			_col.add_child(h)
		else:
			var r := UI.rich(17, Color("#dfe3ea"))
			r.add_theme_constant_override("line_separation", 9)
			r.text = _with_terms(str(b.t), used, color)
			r.meta_underlined = false
			r.meta_clicked.connect(_term_clicked)
			_col.add_child(r)
	var end := UI.label("— page %d —" % page, 11, UI.MUTED, UI.f_mono)
	end.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_col.add_child(end)
	var i := pages.find(page)
	_page_l.text = "Page %d / %d" % [page, int(lesson.ch.endPage)]
	_sec_l.text = _section_for_page()
	_update_play()


## key terms: the first time each appears on the page, underlined and tappable
func _with_terms(text: String, used: Dictionary, color: Color) -> String:
	var spans: Array = []
	for i in _terms.size():
		if used.has(i):
			continue
		var m: RegExMatch = _terms[i].rx.search(text)
		if m:
			var clash := false
			for s in spans:
				if m.get_start() < s.y and m.get_end() > s.x:
					clash = true
			if not clash:
				spans.append(Vector3i(m.get_start(), m.get_end(), i))
				used[i] = true
	spans.sort_custom(func(a, b): return a.x < b.x)
	var out := ""
	var at := 0
	var hex := color.lightened(0.25).to_html(false)
	for s in spans:
		out += UI.esc(text.substr(at, s.x - at))
		out += "[url=%d][color=#%s][u]%s[/u][/color][/url]" % [s.z, hex, UI.esc(text.substr(s.x, s.y - s.x))]
		at = s.y
	return out + UI.esc(text.substr(at))


func _term_clicked(meta: Variant) -> void:
	var i := int(str(meta))
	if i < 0 or i >= _terms.size():
		return
	var t: Dictionary = _terms[i]
	var box := UI.vbox(10)
	box.name = "TermCard"
	var d: String = t.d.strip_edges()
	if d == "":
		d = "This is one of the chapter's key terms — it comes up often. Listen to the notes around this page for its meaning."
	box.add_child(UI.label(d, 16, UI.TEXT, null, true))
	if t.p > 0:
		var go := UI.btn("Explained on page %d" % t.p, "soft", "read", lesson.subject_color())
		go.pressed.connect(func() -> void:
			App.main.close_sheet()
			go_page(t.p))
		box.add_child(go)
	App.main.open_sheet(t.t.capitalize(), box, 520)


func _read_aloud() -> void:
	var p := lesson.player
	if p.playing and not p.paused:
		p.toggle()
	elif p.playing and p.paused:
		p.toggle()
	else:
		var i := p.index_for_page(page)
		if i >= 0:
			p.play(i)
	_update_play()


## while the voice reads on, the page follows it
func _follow() -> void:
	_update_play()
	if not visible or not lesson.player.playing:
		return
	var n := lesson.player.note()
	if not n.is_empty() and not n.get("intro", false) and int(n.p) != page and int(n.p) in pages:
		go_page(int(n.p))


func _update_play() -> void:
	if not is_instance_valid(_play):
		return
	var on: bool = lesson.player.playing and not lesson.player.paused
	_play.icon = UI.icon("pause" if on else "play", 24)
	_play.tooltip_text = "Pause" if on else "Read this page aloud"
