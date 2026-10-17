class_name Library
extends RefCounted
## Your books: PDFs (or text files) a student added. The browser turns each one into the NCERT pack format
## (web/import/driver.js runs the study console's own scanner), so Listen, Read, Hologram and Summary work
## on it unchanged and its MCQs join Practice. The pack is user://books/<id>.json, its MCQs
## user://books/<id>.mcq.json; the list sits in App.data.books, saved together with all the progress.

const DIR := "user://books/"

static var _practice: Array = []
static var _practice_key := "-" # the books + theme the practice chapters were built for


static func books() -> Array:
	if not App.data.get("books") is Array:
		App.data.books = []
	return App.data.books


static func entry(id: String) -> Dictionary:
	for e in books():
		if e is Dictionary and str(e.get("id", "")) == id:
			return e
	return {}


static func is_book_id(id: String) -> bool:
	return id.begins_with("u")


## ids come from the converter ("u" + a base-36 hash) and name files, so nothing else is accepted
static func valid_id(id: String) -> bool:
	return RegEx.create_from_string("^u[0-9a-z]{1,16}$").search(id) != null


static func pack_path(id: String) -> String:
	return DIR + id + ".json"


static func mcq_path(id: String) -> String:
	return DIR + id + ".mcq.json"


# ───────── a converted book → the library ─────────

## every field the lesson tabs read, with the right type: an odd scan can never break a tab
static func normalise(p: Variant) -> Dictionary:
	if not p is Dictionary or not p.get("chapters") is Array:
		return {}
	var out := {"id": str(p.get("id", "")), "title": str(p.get("title", "")).strip_edges(), "subject": str(p.get("subject", "general")),
		"words": _int(p.get("words")), "source": p.get("source") if p.get("source") is Dictionary else {}, "chapters": []}
	if out.title == "":
		out.title = "My book"
	for c in p.chapters:
		if not c is Dictionary:
			continue
		var n: int = out.chapters.size() + 1
		var start := maxi(1, _int(c.get("startPage"), 1))
		var ch := {
			"n": n, "title": _text(c.get("title"), "Chapter %d" % n), "startPage": start, "intro": _text(c.get("intro"), ""),
			"sections": _items(c.get("sections"), {"t": "", "p": start}),
			"blocks": _items(c.get("blocks"), {"k": "p", "t": "", "p": start}),
			"notes": _items(c.get("notes"), {"t": "", "p": start, "s": 0, "w": 0}),
			"keyNotes": _items(c.get("keyNotes"), {"t": "", "p": start, "s": 0, "w": 0}),
			"terms": _items(c.get("terms"), {"t": "", "d": "", "p": 0, "n": 0}),
			"formulas": (c.get("formulas") as Array).filter(func(x): return x is String) if c.get("formulas") is Array else [],
			"summary": _items(c.get("summary"), {"t": "", "p": start}),
			"quiz": _questions(c.get("quiz"), {"q": "", "o": [], "a": 0, "term": "", "p": 0}),
			"mcq": _questions(c.get("mcq"), {"q": "", "o": [], "a": 0, "h": "", "t": "", "p": 0}),
			"holograms": _items(c.get("holograms"), {"hash": "", "title": "", "fig": "", "why": []}).filter(func(h): return h.hash != ""),
			"figures": _int(c.get("figures")), "tables": _int(c.get("tables")), "examples": _int(c.get("examples")),
		}
		ch.blocks = ch.blocks.filter(func(b): return b.t != "")
		ch.notes = ch.notes.filter(func(x): return x.t != "")
		ch.keyNotes = ch.keyNotes.filter(func(x): return x.t != "")
		for x in ch.notes + ch.keyNotes: # a note's section index must point at a section
			x.s = clampi(int(x.s), 0, maxi(0, ch.sections.size() - 1))
		var last := maxi(start, _int(c.get("endPage"), start))
		for b in ch.blocks:
			last = maxi(last, int(b.p))
		ch["endPage"] = last
		if ch.intro == "":
			ch.intro = "Chapter %d: %s." % [n, ch.title]
		out.chapters.append(ch)
	if out.chapters.is_empty():
		return {}
	return out


static func _int(v: Variant, def := 0) -> int:
	return int(v) if (v is int or v is float) else def


static func _text(v: Variant, def: String) -> String:
	var s := str(v).strip_edges() if v is String else ""
	return s if s != "" else def


static func _items(v: Variant, spec: Dictionary) -> Array:
	var out: Array = []
	if not v is Array:
		return out
	for x in v:
		if not x is Dictionary:
			continue
		var d := {}
		for k in spec:
			var def: Variant = spec[k]
			var val: Variant = x.get(k, def)
			match typeof(def):
				TYPE_STRING:
					d[k] = str(val) if val is String else def
				TYPE_INT:
					d[k] = _int(val, def)
				TYPE_ARRAY:
					d[k] = (val as Array).filter(func(y): return y is String) if val is Array else []
				_:
					d[k] = val
		out.append(d)
	return out


## questions with 2+ distinct options and the answer among them (the rest are dropped)
static func _questions(v: Variant, spec: Dictionary) -> Array:
	return _items(v, spec).filter(func(q): return q.q != "" and q.o.size() >= 2 and q.a >= 0 and q.a < q.o.size())


## the converter's JSON → files + a library entry. {id, entry, replaced} or {error}
static func install(json_text: String) -> Dictionary:
	var pack := normalise(JSON.parse_string(json_text))
	if pack.is_empty():
		return {"error": "The PDF was read, but no chapters came out of it. Try another PDF."}
	var id: String = pack.id
	if not valid_id(id):
		return {"error": "The converted book has no valid name. Reload the page and try again."}
	DirAccess.make_dir_recursive_absolute(DIR)
	var practice := {"chapters": []}
	for c in pack.chapters:
		practice.chapters.append({"n": c.n, "title": c.title, "mcq": c.mcq})
	var stored := pack.duplicate()
	stored.chapters = []
	for c in pack.chapters: # the MCQs live in their own small file (Practice reads every book's)
		var d: Dictionary = c.duplicate()
		d.erase("mcq")
		stored.chapters.append(d)
	var full := "There is not enough storage space on this device to keep this book. Delete a book you have finished, then try again."
	if not _write(pack_path(id), JSON.stringify(stored)):
		return {"error": full}
	if not _write(mcq_path(id), JSON.stringify(practice)):
		DirAccess.remove_absolute(pack_path(id))
		return {"error": full}
	var e := _entry_for(pack)
	var old := entry(id)
	if old.is_empty():
		books().append(e)
	else: # the same file again: scanned afresh, progress kept (and trimmed to the new chapters)
		e.added = old.get("added", e.added)
		var list := books()
		for i in list.size():
			if list[i] is Dictionary and str(list[i].get("id", "")) == id:
				list[i] = e
		_fit_progress(pack)
	App.forget_pack(id)
	_practice_key = "-"
	App.save_now()
	App.books_changed.emit()
	return {"id": id, "entry": e, "replaced": not old.is_empty()}


static func _write(path: String, text: String) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(text)
	var ok := f.get_error() == OK
	f.close()
	return ok and FileAccess.file_exists(path) and FileAccess.get_file_as_string(path).length() == text.length()


static func _entry_for(pack: Dictionary) -> Dictionary:
	var src: Dictionary = pack.source
	var chapters: Array = []
	var notes := 0
	var keys := 0
	var mcq := 0
	var holos := {}
	for c in pack.chapters:
		notes += c.notes.size()
		keys += c.keyNotes.size()
		mcq += c.mcq.size()
		for h in c.holograms:
			holos[h.hash] = true
		chapters.append({"n": c.n, "t": c.title, "notes": c.notes.size(), "mcq": c.mcq.size(), "quiz": c.quiz.size(), "pages": int(c.endPage) - int(c.startPage) + 1,
			"sections": c.sections.size(), "holograms": c.holograms})
	return {"id": pack.id, "title": pack.title, "subject": pack.subject, "name": str(src.get("name", "")), "size": _int(src.get("size")),
		"kind": str(src.get("kind", "pdf")), "pages": _int(src.get("pages")), "scanned": _int(src.get("scanned")), "words": pack.words,
		"notes": notes, "keys": keys, "mcq": mcq, "holos": holos.size(), "added": Time.get_unix_time_from_system(), "chapters": chapters}


## after a rescan: drop progress that points past the new chapters, notes or pages
static func _fit_progress(pack: Dictionary) -> void:
	var by_n := {}
	for c in pack.chapters:
		by_n[int(c.n)] = c
	for k in App.data.chapters.keys():
		var parts := str(k).split(":")
		if parts.size() != 2 or parts[0] != pack.id:
			continue
		var c: Dictionary = by_n.get(int(parts[1]), {})
		if c.is_empty():
			App.data.chapters.erase(k)
			continue
		var p: Dictionary = App.data.chapters[k]
		var heard: Dictionary = p.get("heard", {}) if p.get("heard") is Dictionary else {}
		for h in heard.keys():
			var s := str(h)
			var i := int(s.trim_prefix("k"))
			if (s.begins_with("k") and i >= c.keyNotes.size()) or (not s.begins_with("k") and i >= c.notes.size()):
				heard.erase(h)
		p.heard = heard
		p.notes = c.notes.size()
		p.note = clampi(int(p.get("note", 0)), 0, c.notes.size())
		p.page = clampi(int(p.get("page", 0)), 0, int(c.endPage))
		if int(p.get("quiz", -1)) > mini(c.quiz.size(), 8):
			p.quiz = mini(c.quiz.size(), 8)


## delete a book with everything that belongs to it: files, progress, practice choices
static func remove(id: String) -> void:
	if not valid_id(id):
		return
	for f in [pack_path(id), mcq_path(id)]:
		if FileAccess.file_exists(f):
			DirAccess.remove_absolute(f)
	var list := books()
	for i in range(list.size() - 1, -1, -1):
		if list[i] is Dictionary and str(list[i].get("id", "")) == id:
			list.remove_at(i)
	var prefix := id + ":"
	for k in App.data.chapters.keys():
		if str(k).begins_with(prefix):
			App.data.chapters.erase(k)
	if str(App.data.get("last", "")).begins_with(prefix):
		App.data.last = _latest_chapter()
	var pr: Variant = App.data.get("practice")
	if pr is Dictionary:
		for key in ["sel"]:
			if pr.get(key) is Array:
				pr[key] = (pr[key] as Array).filter(func(x): return not str(x).begins_with(prefix))
		var sh: Variant = pr.get("shooter")
		if sh is Dictionary and sh.get("sel") is Array:
			sh.sel = (sh.sel as Array).filter(func(x): return not str(x).begins_with(prefix))
	App.forget_pack(id)
	_practice_key = "-"
	App.save_now()
	App.books_changed.emit()


## the chapter studied most recently (for Continue), skipping ones whose book is gone
static func _latest_chapter() -> String:
	var best := ""
	var t := -1.0
	for k in App.data.chapters:
		var parts := str(k).split(":")
		if parts.size() != 2 or App.find_chapter(parts[0], int(parts[1])).is_empty():
			continue
		var last := float(App.data.chapters[k].get("last", 0))
		if last > t:
			t = last
			best = str(k)
	return best


## at start-up: a book whose file has gone (browser storage cleared) leaves the list
static func check() -> void:
	var list := books()
	var gone := false
	for i in range(list.size() - 1, -1, -1):
		var e: Variant = list[i]
		if not e is Dictionary or not valid_id(str(e.get("id", ""))) or not FileAccess.file_exists(pack_path(str(e.id))):
			list.remove_at(i)
			gone = true
	if gone:
		App.save()


# ───────── reading ─────────

static func load_pack(id: String) -> Dictionary:
	if not valid_id(id) or not FileAccess.file_exists(pack_path(id)):
		return {}
	var p := normalise(JSON.parse_string(FileAccess.get_file_as_string(pack_path(id))))
	if not p.is_empty():
		p.id = id
	return p


static func chapter(id: String, no: int) -> Dictionary:
	var e := entry(id)
	for c in e.get("chapters", []):
		if int(c.n) == no:
			return c
	return {}


## for App.find_chapter: {book, chapter: {no, title, holograms}}
static func chapter_info(id: String, no: int) -> Dictionary:
	var e := entry(id)
	var c := chapter(id, no)
	if c.is_empty():
		return {}
	return {"book": e, "chapter": {"no": int(c.n), "title": str(c.t), "holograms": c.get("holograms", [])}}


static func fraction(e: Dictionary) -> float:
	var chs: Array = e.get("chapters", [])
	if chs.is_empty():
		return 0.0
	var sum := 0.0
	for c in chs:
		sum += App.chapter_fraction(App.chapter_key(str(e.id), int(c.n)))
	return sum / chs.size()


static func heard(e: Dictionary) -> int:
	var n := 0
	for c in e.get("chapters", []):
		n += mini(App.heard_count(App.chapter_key(str(e.id), int(c.n))), int(c.get("notes", 0)))
	return n


# ───────── Practice: each chapter's MCQs, in the practice bank's shape ─────────

static func practice_chapters() -> Array:
	var key := UI.palette
	for e in books():
		key += "," + str(e.get("id", "")) + str(e.get("added", ""))
	if key == _practice_key:
		return _practice
	_practice = []
	for e in books():
		if int(e.get("mcq", 0)) == 0 or not FileAccess.file_exists(mcq_path(str(e.id))):
			continue
		var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(mcq_path(str(e.id))))
		if not d is Dictionary or not d.get("chapters") is Array:
			continue
		var color := "#" + UI.subject_color(str(e.subject)).to_html(false)
		for c in d.chapters:
			if not c is Dictionary:
				continue
			var qs := _questions(c.get("mcq"), {"q": "", "o": [], "a": 0, "h": "", "t": "", "p": 0})
			if qs.is_empty():
				continue
			_practice.append({"id": "%s:%d" % [e.id, _int(c.get("n"))], "title": "%d. %s" % [_int(c.get("n")), str(c.get("title", ""))], "color": color,
				"group": str(e.id), "gens": [qs], "book": true})
	_practice_key = key
	return _practice


static func practice_groups() -> Array:
	var seen := {}
	for c in practice_chapters():
		seen[c.group] = true
	var out: Array = []
	for e in books():
		if seen.has(str(e.id)):
			out.append({"id": str(e.id), "title": str(e.title), "book": true})
	return out


## the practice chapter ids of one book (for "Practice the whole book")
static func practice_ids(id: String) -> Array:
	return practice_chapters().filter(func(c): return c.group == id).map(func(c): return c.id)
