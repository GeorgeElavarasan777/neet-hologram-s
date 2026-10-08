class_name SummaryTab
extends Control
## Summary: where you stand in this chapter, the key points, a recall quiz (best score kept), the key
## terms, and every chapter of the book with its progress (tap one to go there).

var lesson: LessonScreen
var _col: VBoxContainer
var _quiz_box: VBoxContainer
var _qi := 0
var _score := 0
var _answered := false


func _init(l: LessonScreen) -> void:
	lesson = l


func _ready() -> void:
	_col = UI.vbox(14)
	_col.name = "Summary"
	var s := UI.scroller(UI.pad(_col, 16, 16, 16, 28), 760)
	s.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(s)
	_render()


func on_show() -> void:
	_render()


func _render() -> void:
	UI.clear(_col)
	var ch: Dictionary = lesson.ch
	var color := lesson.subject_color()
	var prog := App.chap(lesson.key)
	# ── standing
	var stats := UI.card(14, UI.CARD, 16)
	var srow := UI.hbox(10)
	var heard := App.heard_count(lesson.key)
	srow.add_child(_stat("%d/%d" % [heard, ch.notes.size()], "notes heard", color))
	var best := int(prog.get("quiz", -1))
	srow.add_child(_stat("—" if best < 0 else "%d/%d" % [best, mini(ch.quiz.size(), 8)], "best quiz", UI.WARN))
	srow.add_child(_stat("%d%%" % int(round(App.chapter_fraction(lesson.key) * 100)), "chapter", UI.GOOD))
	UI.box(stats).add_child(srow)
	_col.add_child(stats)
	# ── key points
	if not ch.summary.is_empty():
		_col.add_child(UI.eyebrow("Key points"))
		var kp := UI.card(14, UI.CARD, 16)
		for item in ch.summary:
			var row := UI.hbox(10)
			var dot := UI.label("•", 16, color, UI.f_bold)
			dot.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
			row.add_child(dot)
			var t := UI.label(str(item.t), 15, UI.TEXT, null, true)
			t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(t)
			var pg := UI.btn("p. %d" % int(item.p), "ghost")
			pg.custom_minimum_size = Vector2(52, 36)
			pg.add_theme_font_size_override("font_size", 12)
			pg.add_theme_color_override("font_color", UI.MUTED)
			pg.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
			pg.pressed.connect(func() -> void:
				lesson.set_tab("read")
				lesson.tab_node("read").go_page(int(item.p)))
			row.add_child(pg)
			UI.box(kp).add_child(row)
		_col.add_child(kp)
	# ── recall quiz
	if not ch.quiz.is_empty():
		_col.add_child(UI.eyebrow("Recall quiz"))
		_quiz_box = UI.vbox(10)
		_quiz_box.name = "Quiz"
		var qc := UI.card(14, UI.CARD, 16)
		UI.box(qc).add_child(_quiz_box)
		_col.add_child(qc)
		_quiz_intro()
	# ── key terms
	if not ch.terms.is_empty():
		_col.add_child(UI.eyebrow("Key terms"))
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 8)
		flow.add_theme_constant_override("v_separation", 8)
		for t in ch.terms.slice(0, 18):
			var b := UI.btn(str(t.t), "chip", "", color)
			b.pressed.connect(_term.bind(t))
			flow.add_child(b)
		_col.add_child(flow)
	# ── every chapter (tap to go)
	_col.add_child(UI.eyebrow("Chapters in this book"))
	var list := UI.vbox(6)
	list.name = "Mission"
	for i in lesson.pack.chapters.size():
		var c: Dictionary = lesson.pack.chapters[i]
		var k := App.chapter_key(lesson.pack_id, int(c.n))
		var tc := TapCard.new(12, UI.CARD2 if i == lesson.ch_idx else UI.CARD, 12, color if i == lesson.ch_idx else UI.BORDER)
		tc.name = "Mission%d" % int(c.n)
		var row := UI.hbox(10)
		row.add_child(UI.label("%02d" % int(c.n), 12, color, UI.f_mono))
		var tt := UI.vbox(3)
		tt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tt.add_child(UI.line(c.title, 14, UI.TEXT, UI.f_semi))
		tt.add_child(UI.bar(App.chapter_fraction(k), color, 3))
		row.add_child(tt)
		row.add_child(UI.label("%d%%" % int(round(App.chapter_fraction(k) * 100)), 11, UI.MUTED, UI.f_mono))
		UI.box(tc).add_child(row)
		tc.tapped.connect(_mission.bind(i))
		list.add_child(tc)
	_col.add_child(list)


func _stat(big: String, small: String, color: Color) -> Control:
	var v := UI.vbox(0)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var a := UI.label(big, 20, color, UI.f_bold)
	a.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var b := UI.label(small, 11, UI.MUTED, UI.f_mono)
	b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(a)
	v.add_child(b)
	return v


func _term(t: Dictionary) -> void:
	var box := UI.vbox(10)
	var d := str(t.get("d", "")).strip_edges()
	box.add_child(UI.label(d if d != "" else "A key term of this chapter (it comes up %d times)." % int(t.get("n", 0)), 16, UI.TEXT, null, true))
	if int(t.get("p", 0)) > 0:
		var go := UI.btn("Explained on page %d" % int(t.p), "soft", "read", lesson.subject_color())
		go.pressed.connect(func() -> void:
			App.main.close_sheet()
			lesson.set_tab("read")
			lesson.tab_node("read").go_page(int(t.p)))
		box.add_child(go)
	App.main.open_sheet(str(t.t).capitalize(), box, 520)


func _mission(i: int) -> void:
	var c: Dictionary = lesson.pack.chapters[i]
	var box := UI.vbox(10)
	box.name = "MissionSheet"
	var k := App.chapter_key(lesson.pack_id, int(c.n))
	box.add_child(UI.label("%d of %d notes heard · %d%% done" % [App.heard_count(k), c.notes.size(), int(round(App.chapter_fraction(k) * 100))], 14, UI.TEXT2))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for a in [["listen", "Listen"], ["read", "Read"], ["summary", "Summary"], ["holo", "Hologram"]]:
		var b := UI.btn(a[1], "soft", a[0], lesson.subject_color())
		b.name = "Go_" + a[0]
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func() -> void:
			App.main.close_sheet()
			lesson.tab = a[0]
			lesson.select_chapter(i))
		grid.add_child(b)
	box.add_child(grid)
	App.main.open_sheet("%d. %s" % [int(c.n), c.title], box, 480)


# ───────── recall quiz ─────────

func _quiz_intro() -> void:
	_clear_quiz()
	var n := mini(lesson.ch.quiz.size(), 8)
	_quiz_box.add_child(UI.label("%d fill-in-the-blank questions from this chapter. Pick the missing term." % n, 14, UI.TEXT2, null, true))
	var go := UI.btn("Start the quiz", "primary", "quiz", lesson.subject_color())
	go.name = "StartQuiz"
	go.pressed.connect(func() -> void:
		_qi = 0
		_score = 0
		_question())
	_quiz_box.add_child(go)


func _clear_quiz() -> void:
	UI.clear(_quiz_box)


func _question() -> void:
	_clear_quiz()
	_answered = false
	var qs: Array = lesson.ch.quiz.slice(0, 8)
	var q: Dictionary = qs[_qi]
	_quiz_box.add_child(UI.label("QUESTION %d OF %d" % [_qi + 1, qs.size()], 11, lesson.subject_color(), UI.f_mono))
	_quiz_box.add_child(UI.label(str(q.q), 16, UI.TEXT, null, true))
	var opts := UI.vbox(8)
	opts.name = "Options"
	for i in q.o.size():
		var b := UI.btn("%s   %s" % [char(65 + i), q.o[i]], "card")
		b.name = "Opt%d" % i
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.pressed.connect(_answer.bind(i, opts, q))
		opts.add_child(b)
	_quiz_box.add_child(opts)


func _answer(i: int, opts: VBoxContainer, q: Dictionary) -> void:
	if _answered:
		return
	_answered = true
	var right := int(q.a)
	if i == right:
		_score += 1
	for j in opts.get_child_count():
		var b: Button = opts.get_child(j)
		if j == right:
			UI.style_btn(b, "soft", UI.GOOD)
		elif j == i:
			UI.style_btn(b, "soft", UI.BAD)
	var fb := UI.label(("✓ Correct" if i == right else "✗ The answer is \"%s\"" % q.o[right]) + ("" if int(q.get("p", 0)) <= 0 else " · page %d" % int(q.p)), 14, UI.GOOD if i == right else UI.BAD, UI.f_semi, true)
	_quiz_box.add_child(fb)
	var last: bool = _qi >= mini(lesson.ch.quiz.size(), 8) - 1
	var nxt := UI.btn("See your score" if last else "Next question", "primary", "chev", lesson.subject_color())
	nxt.name = "NextQ"
	nxt.pressed.connect(func() -> void:
		if last:
			_finish()
		else:
			_qi += 1
			_question())
	_quiz_box.add_child(nxt)


func _finish() -> void:
	_clear_quiz()
	var n := mini(lesson.ch.quiz.size(), 8)
	var prog := App.chap(lesson.key)
	var best := maxi(int(prog.get("quiz", -1)), _score)
	prog.quiz = best
	App.save()
	var big := UI.label("%d / %d" % [_score, n], 30, UI.GOOD if _score * 2 >= n else UI.WARN, UI.f_bold)
	big.name = "Score"
	_quiz_box.add_child(big)
	_quiz_box.add_child(UI.label("Best so far: %d / %d. Listen to the notes again for the ones you missed." % [best, n], 14, UI.TEXT2, null, true))
	var again := UI.btn("Try again", "card", "replay")
	again.pressed.connect(func() -> void:
		_qi = 0
		_score = 0
		_question())
	_quiz_box.add_child(again)
