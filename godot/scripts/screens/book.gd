class_name BookScreen
extends Screen
## One of your books: how far you are, and its chapters in the notebook margin. A chapter opens a sheet:
## Listen, Read, Summary, Hologram and Practice (its MCQs). ⋯ has Practice for the whole book and Delete.

var id := ""
var e := {}
var _head: VBoxContainer
var list: VBoxContainer


func _init(book_id: String) -> void:
	id = book_id


func _ready() -> void:
	name = "Book"
	e = Library.entry(id)
	build(str(e.get("title", "Your book")), "")
	add_action("more", "Book options", _options, "BookOptions")
	var col := UI.vbox(12)
	_head = UI.vbox(6)
	col.add_child(_head)
	list = UI.margin_list(10)
	col.add_child(list)
	body.add_child(UI.scroller(UI.pad(col, 16, 14, 16, 28)))
	App.books_changed.connect(_on_books_changed)
	render()


func on_resume() -> void:
	render()


func _on_books_changed() -> void:
	if is_inside_tree() and visible:
		render()


func render() -> void:
	e = Library.entry(id)
	UI.clear(_head)
	UI.clear(list)
	if e.is_empty():
		set_titles("Book", "")
		_head.add_child(UI.label("This book is no longer on this device.", 15, UI.MUTED, null, true))
		return
	var color := UI.subject_color(str(e.subject))
	var size := UI.plural(int(e.pages), "page") if int(e.pages) > 0 else UI.plural(int(e.words), "word")
	set_titles(str(e.title), "%s · %s · %s" % [UI.plural(e.chapters.size(), "chapter"), size, UI.plural(int(e.mcq), "MCQ")])
	var f := Library.fraction(e)
	var prow := UI.hbox(10)
	var pb := UI.bar(f, color, 6)
	pb.name = "BookProgress"
	pb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	prow.add_child(pb)
	var pl := UI.label("%d%%" % int(round(f * 100)), 13, UI.TEXT2, UI.f_med)
	pl.name = "BookPct"
	prow.add_child(pl)
	_head.add_child(prow)
	var src := "%d of %s heard" % [Library.heard(e), UI.plural(int(e.notes), "voice note")]
	if str(e.get("name", "")) != "":
		src += " · from " + str(e.name)
	_head.add_child(UI.label(src, 13, UI.MUTED, null, true))
	for c in e.chapters:
		list.add_child(UI.margin_row(str(int(c.n)), color, _chapter_card(c, color)))


func _chapter_card(c: Dictionary, color: Color) -> Control:
	var k := App.chapter_key(id, int(c.n))
	var tc := TapCard.new(14, UI.CARD, 16)
	tc.name = "BookCh%d" % int(c.n)
	var row := UI.hbox(12)
	var t := UI.vbox(3)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(UI.label(str(c.t), 17, UI.TEXT, UI.f_serif_semi, true))
	var meta := "%s · %s" % [UI.plural(int(c.pages), "page"), UI.plural(int(c.notes), "voice note")]
	if int(c.mcq) > 0:
		meta += " · " + UI.plural(int(c.mcq), "MCQ")
	if not c.holograms.is_empty():
		meta += " · " + UI.plural(c.holograms.size(), "hologram")
	t.add_child(UI.label(meta, 12, UI.MUTED, null, true))
	if App.data.chapters.has(k):
		var prow := UI.hbox(8)
		var pb := UI.bar(App.chapter_fraction(k), color, 4)
		pb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		prow.add_child(pb)
		prow.add_child(UI.label("%d heard" % mini(App.heard_count(k), int(c.notes)), 12, UI.MUTED, UI.f_med))
		t.add_child(prow)
	row.add_child(t)
	row.add_child(UI.icon_rect("chev", 18, UI.MUTED))
	UI.box(tc).add_child(row)
	tc.tapped.connect(_chapter_sheet.bind(c))
	return tc


func _chapter_sheet(c: Dictionary) -> void:
	var color := UI.subject_color(str(e.subject))
	var no := int(c.n)
	var box := UI.vbox(12)
	box.name = "ChapterSheet"
	box.add_child(UI.label("%s · %s · %s" % [str(e.title), UI.plural(int(c.pages), "page"), UI.plural(int(c.sections), "section")], 13, UI.MUTED, null, true))
	box.add_child(UI.eyebrow("Study this chapter"))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	for a in [["listen", "Listen", "Voice notes, word by word"], ["read", "Read", "Page by page"], ["summary", "Summary", "Key points & recall quiz"], ["holo", "Hologram", "3-D figures that match"]]:
		grid.add_child(_act(a[0], a[1], a[2], color, _open.bind(no, a[0])))
	box.add_child(grid)
	var n_mcq := int(c.mcq)
	var pr := _act("practice", "Practice · %s" % UI.plural(n_mcq, "MCQ"), "Questions written from this chapter" if n_mcq > 0 else "Too few key terms here to write questions", color, _practice.bind([App.chapter_key(id, no)]))
	pr.name = "Act_practice"
	if n_mcq == 0:
		pr.modulate.a = 0.55
		pr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(pr)
	var holos: Array = c.get("holograms", [])
	if not holos.is_empty():
		box.add_child(UI.eyebrow("Holograms"))
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 8)
		flow.add_theme_constant_override("v_separation", 8)
		for h in holos:
			var b := UI.btn(_short(str(h.title), 38), "chip", "holo", color)
			b.pressed.connect(func() -> void:
				App.main.close_sheet()
				App.push(HoloScreen.new(str(h.hash), 0)))
			flow.add_child(b)
		box.add_child(flow)
	App.main.open_sheet("%d. %s" % [no, str(c.t)], box)


func _act(icon_name: String, title: String, sub: String, color: Color, cb: Callable) -> TapCard:
	var tc := TapCard.new(12, UI.CARD2, 14)
	tc.name = "Act_" + icon_name
	tc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var r := UI.hbox(10)
	r.add_child(UI.badge(icon_name, color, 36))
	var tv := UI.vbox(0)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tv.add_child(UI.label(title, 15, UI.TEXT, UI.f_bold))
	tv.add_child(UI.label(sub, 12, UI.MUTED, null, true))
	r.add_child(tv)
	UI.box(tc).add_child(r)
	tc.tapped.connect(cb)
	return tc


static func _short(s: String, n: int) -> String:
	return s if s.length() <= n else s.substr(0, n - 1).strip_edges() + "…"


func _open(no: int, tab: String) -> void:
	App.main.close_sheet()
	App.push(LessonScreen.new(id, no, tab))


func _practice(ids: Array) -> void:
	App.main.close_sheet()
	App.push(PracticeScreen.new(ids))


# ───────── ⋯ : practise everything, delete ─────────

func _options() -> void:
	if e.is_empty():
		return
	var box := UI.vbox(12)
	box.name = "BookMenu"
	var info := "%s · added from %s" % [UI.plural(e.chapters.size(), "chapter"), str(e.get("name", "a file"))]
	box.add_child(UI.label(info, 13, UI.MUTED, null, true))
	var all := UI.btn("Practise the whole book · %s" % UI.plural(int(e.mcq), "MCQ"), "card", "practice")
	all.name = "BookPracticeAll"
	all.alignment = HORIZONTAL_ALIGNMENT_LEFT
	all.disabled = int(e.mcq) == 0
	all.pressed.connect(func() -> void: _practice(Library.practice_ids(id)))
	box.add_child(all)
	var del := UI.btn("Delete this book", "soft", "trash", UI.BAD)
	del.name = "DeleteBook"
	del.alignment = HORIZONTAL_ALIGNMENT_LEFT
	del.pressed.connect(_confirm_delete.bind(box))
	box.add_child(del)
	App.main.open_sheet(str(e.title), box)


func _confirm_delete(box: VBoxContainer) -> void:
	UI.clear(box)
	box.add_child(UI.label("Delete “%s”?" % str(e.title), 17, UI.TEXT, UI.f_bold, true))
	box.add_child(UI.label("Its voice notes, pages and questions go, and so does your progress in it: notes heard, page marks and quiz scores. You can add the PDF again later.", 14, UI.TEXT2, null, true))
	var row := UI.hbox(10)
	var yes := UI.btn("Delete", "primary", "trash", UI.BAD)
	yes.name = "DeleteConfirm"
	yes.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	yes.pressed.connect(_delete)
	row.add_child(yes)
	var no := UI.btn("Keep it", "card")
	no.name = "DeleteCancel"
	no.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	no.pressed.connect(App.main.close_sheet)
	row.add_child(no)
	box.add_child(row)


func _delete() -> void:
	var title := str(e.title)
	Library.remove(id)
	App.main.close_sheet()
	App.main.back() # straight to Home (two history.back() calls in a row can merge into one)
	App.toast("Deleted “%s”" % title)
