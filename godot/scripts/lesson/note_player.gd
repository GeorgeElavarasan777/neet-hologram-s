class_name NotePlayer
extends Node
## Steps through a chapter's voice notes: plays one note, marks it heard, moves on (auto-advance),
## and reports the word being spoken (for highlighting).

signal changed # note index, playing or paused changed
signal word(from: int, to: int) # character range of the spoken word in the current note

var key := "" # progress key of the chapter
var list: Array = [] # [{t, p, s, w, intro?, ni}] ni = index in the chapter's notes (or "k<i>" for key points)
var idx := 0
var playing := false
var paused := false
var total_notes := 0


func _ready() -> void:
	Speech.word_at.connect(_on_word)
	Speech.done.connect(_on_done)


func load_chapter(ch: Dictionary, progress_key: String, key_only: bool) -> void:
	stop()
	key = progress_key
	list = []
	total_notes = ch.notes.size()
	if str(ch.get("intro", "")) != "":
		list.append({"t": ch.intro, "p": int(ch.startPage), "s": -1, "intro": true, "ni": ""})
	var src: Array = ch.keyNotes if key_only and not ch.keyNotes.is_empty() else ch.notes
	var prefix := "k" if src == ch.keyNotes and key_only else ""
	for i in src.size():
		var n: Dictionary = src[i]
		list.append({"t": n.t, "p": int(n.p), "s": int(n.s), "w": int(n.get("w", 0)), "ni": prefix + str(i)})
	idx = 0
	changed.emit()


func note() -> Dictionary:
	return list[idx] if idx >= 0 and idx < list.size() else {}


func is_heard(i: int) -> bool:
	if i < 0 or i >= list.size() or list[i].get("intro", false):
		return false
	return App.data.chapters.has(key) and App.data.chapters[key].heard.has(list[i].ni)


func play(i := -1) -> void:
	if list.is_empty():
		return
	if i >= 0:
		idx = clampi(i, 0, list.size() - 1)
	playing = true
	paused = false
	Speech.speak(list[idx].t)
	App.chap(key).note = idx
	App.save()
	changed.emit()


func toggle() -> void:
	if playing and not paused:
		paused = true
		Speech.pause()
	elif playing and paused:
		paused = false
		Speech.resume()
	else:
		play(idx)
	changed.emit()


func stop() -> void:
	playing = false
	paused = false
	if Speech.is_active():
		Speech.stop(false)
	changed.emit()


func next() -> void:
	if idx < list.size() - 1:
		if playing:
			play(idx + 1)
		else:
			idx += 1
			changed.emit()


func prev() -> void:
	if idx > 0:
		if playing:
			play(idx - 1)
		else:
			idx -= 1
			changed.emit()


func select(i: int) -> void:
	idx = clampi(i, 0, list.size() - 1)
	changed.emit()


func mark(i: int) -> void:
	if i >= 0 and i < list.size() and not list[i].get("intro", false):
		App.mark_heard(key, list[i].ni, total_notes)
		changed.emit()


## first note on a page (for "read this page aloud" and page-follow)
func index_for_page(page: int) -> int:
	for i in list.size():
		if not list[i].get("intro", false) and int(list[i].p) >= page:
			return i
	return -1


func _on_word(pos: int) -> void:
	if not playing or list.is_empty():
		return
	var t: String = list[idx].t
	pos = clampi(pos, 0, maxi(0, t.length() - 1))
	var a := pos
	while a > 0 and t[a - 1] != " " and t[a - 1] != "\n":
		a -= 1
	var b := pos
	while b < t.length() and t[b] != " " and t[b] != "\n":
		b += 1
	word.emit(a, b)


func _on_done(completed: bool) -> void:
	if not playing:
		return
	if completed:
		mark(idx)
		if bool(App.setting("auto_advance", true)) and idx < list.size() - 1:
			play(idx + 1)
			return
	playing = false
	paused = false
	changed.emit()
