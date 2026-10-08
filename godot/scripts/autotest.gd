class_name AutoTest
extends Node
## A new student, automated: taps through every screen with real input events (they go through Godot's
## GUI hit-testing, so a covered or dead button fails), checks each tap did its job, and reports.
## Desktop: godot --headless --path godot -- --autotest   (exit code = failures)
## Web: index.html?autotest — results in window.__holo; the CDP driver screenshots at each window.__shot.

var results: Array = []
var _web := OS.has_feature("web")


func _ready() -> void:
	if DisplayServer.get_name() == "headless": # the headless window is 64×64 — test at a phone's size
		get_window().size = Vector2i(412, 860)
		get_window().content_scale_size = Vector2i.ZERO
		App.main._on_resize()
	await get_tree().create_timer(0.6).timeout
	await _run()
	var fails := results.filter(func(r): return not r.ok).size()
	var summary := "%d passed · %d failed" % [results.size() - fails, fails]
	print("AUTOTEST ", summary)
	if _web:
		JavaScriptBridge.eval("window.__holo = Object.assign(window.__holo || {}, { done: true, summary: %s })" % JSON.stringify(summary))
	else:
		get_tree().quit(fails)


func _step(name: String, ok: bool, detail := "") -> void:
	results.append({"name": name, "ok": ok, "detail": detail})
	print("%s  %s%s" % ["PASS" if ok else "FAIL", name, (" — " + detail) if detail != "" else ""])
	if _web:
		JavaScriptBridge.eval("(window.__holo = window.__holo || { steps: [] }).steps = (window.__holo.steps || []).concat([%s])" % JSON.stringify({"name": name, "ok": ok, "detail": detail}))


## let the CDP driver take a screenshot (waits up to 4 s for it; no driver = no wait)
func _shot(name: String) -> void:
	await _frames(4)
	if not _web:
		return
	JavaScriptBridge.eval("window.__shot = %s" % JSON.stringify(name))
	var t := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t < 4000:
		if str(JavaScriptBridge.eval("window.__shotDone || ''", true)) == name:
			return
		await get_tree().process_frame


func _frames(n := 2) -> void:
	for i in n:
		await get_tree().process_frame


func _wait(cond: Callable, seconds := 8.0) -> bool:
	var t := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t < seconds * 1000:
		if cond.call():
			return true
		await get_tree().process_frame
	return false


func _top() -> Control:
	return App.main.stack.back()


func _find(name: String) -> Control:
	var n: Node = null
	if App.main.has_sheet():
		n = App.main.overlay.find_child(name, true, false)
	if n == null:
		n = _top().find_child(name, true, false)
	return n as Control


## a real tap: scroll it into view, check nothing covers it, press + release at its centre
func _tap(name_or_node: Variant, label := "") -> bool:
	var c: Control = _find(name_or_node) if name_or_node is String else name_or_node
	var what: String = label if label != "" else str(name_or_node if name_or_node is String else c.name)
	if c == null:
		_step("tap " + what, false, "not found")
		return false
	var p := c.get_parent()
	while p:
		if p is ScrollContainer:
			(p as ScrollContainer).ensure_control_visible(c)
			break
		p = p.get_parent()
	await _frames(3)
	if not c.is_visible_in_tree():
		_step("tap " + what, false, "not visible")
		return false
	var center := c.get_global_rect().get_center()
	var hit: Control = null
	var xf: Transform2D = App.main.get_viewport().get_final_transform()
	var pos: Vector2 = xf * center
	var mv := InputEventMouseMotion.new()
	mv.position = pos
	mv.global_position = pos
	App.main.get_viewport().push_input(mv)
	await _frames(2)
	hit = App.main.get_viewport().gui_get_hovered_control()
	if hit != null and hit != c and not c.is_ancestor_of(hit) and not hit.is_ancestor_of(c):
		_step("tap " + what, false, "covered by " + str(hit.get_path()).get_file())
		return false
	for pressed in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = MOUSE_BUTTON_LEFT
		e.pressed = pressed
		e.position = pos
		e.global_position = pos
		e.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
		App.main.get_viewport().push_input(e)
		await _frames(2)
	await _frames(3)
	return true


func _back() -> void:
	App.main.back()
	await _frames(6)


# ───────── the walk-through ─────────

func _run() -> void:
	# 1 · home
	var ok := await _wait(func(): return _find("Subject_physics") != null, 10)
	_step("home shows the subjects", ok)
	await _shot("home")
	# 2 · a subject → a chapter → Listen
	await _tap("Subject_physics", "Physics")
	ok = await _wait(func(): return _top().name == "Subject" and _find("Chapter1") != null)
	_step("Physics opens its chapters", ok)
	await _shot("subject")
	await _tap("Class12", "Class 12 switch")
	ok = await _wait(func(): return _top().title_l.text == "Physics" and _top().sub_l.text.begins_with("Class 12"))
	_step("Class 12 switch", ok, _top().sub_l.text)
	await _tap("Class11", "Class 11 switch")
	await _tap("Chapter1", "chapter 1")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Act_listen") != null)
	_step("a chapter opens its sheet", ok)
	await _shot("chapter-sheet")
	await _tap("Act_listen", "Listen")
	ok = await _wait(func(): return _top().name == "Lesson" and not _top().pack.is_empty() and _find("Pane_listen") != null, 20)
	_step("Listen opens the chapter", ok)
	var lesson = _top()
	await _frames(10)
	await _shot("listen")
	# 3 · listen
	await _tap("Play", "▶ play")
	if not lesson is LessonScreen:
		_step("the lesson is open", false)
		return
	ok = await _wait(func(): return lesson.player.playing)
	_step("▶ starts reading", ok)
	ok = await _wait(func(): return "[bgcolor" in (_find("NowText") as RichTextLabel).text, 4)
	_step("the spoken word is highlighted", ok)
	await _shot("listen-playing")
	ok = await _wait(func(): return lesson.player.idx >= 1, 15)
	_step("auto-advance moves to the next note", ok, "note %d" % lesson.player.idx)
	await _tap("Play", "❚❚ pause")
	ok = await _wait(func(): return lesson.player.paused or not lesson.player.playing)
	_step("❚❚ pauses", ok)
	lesson.player.stop()
	var before: int = lesson.player.idx
	await _tap("Next", "⏭ next note")
	_step("⏭ next note", lesson.player.idx == before + 1, "%d → %d" % [before, lesson.player.idx])
	await _tap("MarkHeard", "✓ mark heard")
	_step("mark heard counts", lesson.player.is_heard(lesson.player.idx))
	var toggle := _find("Toggle")
	var sec_count := 0
	for s in _find("Notes").get_children():
		if str(s.name).begins_with("Sec_"):
			sec_count += 1
	_step("notes are grouped by section", sec_count > 3, "%d sections" % sec_count)
	# open a closed section
	var closed: Control = null
	for s in _find("Notes").get_children():
		if str(s.name).begins_with("Sec_") and not s.get_node("NotesWrap").visible:
			closed = s
			break
	if closed:
		await _tap(closed.find_child("Toggle", true, false), "open a section")
		_step("tapping a section opens it", closed.get_node("NotesWrap").visible)
		await _shot("listen-section")
	# 4 · read
	await _tap("Tab_read", "Read tab")
	ok = await _wait(func(): return _find("Pane_read") != null and _find("Pane_read").visible)
	_step("Read tab", ok)
	var read = lesson.tab_node("read")
	var first_sec := ""
	for s in lesson.ch.sections:
		if int(s.p) == read.page:
			first_sec = s.t
			break
	_step("Read control names the section the page starts with", first_sec == "" or read._sec_l.text == first_sec, read._sec_l.text)
	_step("the title follows the tab", lesson.sub_l.text.begins_with("Read"), lesson.sub_l.text)
	await _shot("read")
	var p0: int = read.page
	await _tap("NextPage", "› next page")
	_step("› next page", read.page > p0, "%d → %d" % [p0, read.page])
	await _tap("PrevPage", "‹ previous page")
	_step("‹ previous page", read.page == p0)
	read._term_clicked(0)
	ok = await _wait(func(): return App.main.has_sheet() and _find("TermCard") != null)
	_step("a key term explains itself", ok)
	await _shot("read-term")
	await _back()
	_step("Back closes the sheet", not App.main.has_sheet())
	await _tap("ReadAloud", "▶ read page aloud")
	ok = await _wait(func(): return lesson.player.playing)
	_step("▶ reads the page aloud", ok)
	lesson.player.stop()
	# 5 · hologram tab (chapter 1 has none → chapter 3)
	await _tap("Tab_holo", "Hologram tab")
	_step("Hologram tab without figures explains itself", _find("Pane_holo") != null)
	await _tap("ChaptersBtn", "☰ chapters")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Ch3") != null)
	_step("☰ lists the chapters", ok)
	await _shot("chapters")
	await _tap("Ch3", "chapter 3")
	ok = await _wait(func(): return lesson.ch_no == 3 and not App.main.has_sheet())
	_step("picking chapter 3 switches the lesson", ok, lesson.title_l.text)
	ok = await _wait(func(): return _find("Holo_p11-3-2") != null, 8)
	_step("chapter 3 lists its hologram", ok)
	await _shot("holo-tab")
	await _tap("Holo_p11-3-2", "the hologram card")
	ok = await _wait(func(): return _top().name == "Holo" and _top().view.model != null, 20)
	_step("the hologram loads in 3-D", ok)
	if ok:
		var hv: HoloView = _top().view
		var n_labels: int = hv.variant.labels.size()
		_step("its labels are drawn", hv._pills.size() == n_labels and n_labels > 0, "%d labels" % hv._pills.size())
		await _frames(20)
		await _shot("hologram")
		await _tap("QuizBtn", "label quiz")
		_step("label quiz hides the names", hv.quiz and hv._pills[0].pill.text == "1")
		await _tap(hv._pills[0].pill, "a numbered label")
		ok = await _wait(func(): return App.main.has_sheet() and hv.revealed.has(0))
		_step("tapping a label reveals and explains it", ok)
		await _back()
		await _tap("LabelsBtn", "labels off")
		_step("labels can be hidden", not hv.labels_on)
		await _tap("LabelsBtn", "labels on")
	await _back()
	# a hologram with a slider (take apart)
	await App.load_holo_index()
	var slid := ""
	for f in App.holo_index:
		if str(f.variants[0].get("slider", "")) != "":
			slid = f.id
			break
	App.push(HoloScreen.new(slid, 0))
	ok = await _wait(func(): return _top().name == "Holo" and _top().view.model != null, 20)
	_step("a moving hologram loads (%s)" % slid, ok)
	if ok:
		var hv2: HoloView = _top().view
		_step("its slider is shown", _find("SliderRow").visible and hv2.has_slider())
		var probe := _moving_node(hv2)
		var a0: Vector3 = probe.global_position if probe else Vector3.ZERO
		(_find("Slider") as HSlider).value = 1.0
		await _frames(4)
		var a1: Vector3 = probe.global_position if probe else Vector3.ZERO
		_step("the slider moves the parts", probe != null and a0.distance_to(a1) > 0.01, "moved %.2f" % a0.distance_to(a1))
		await _shot("hologram-slider")
	await _back()
	# 6 · summary + quiz + mission
	await _tap("Tab_summary", "Summary tab")
	ok = await _wait(func(): return _find("Pane_summary") != null and _find("Pane_summary").visible)
	_step("Summary tab", ok)
	await _shot("summary")
	await _tap("StartQuiz", "start the quiz")
	var answered := 0
	for i in 8:
		var opt := _find("Opt0")
		if opt == null:
			break
		await _tap(opt, "an answer")
		var nq := _find("NextQ")
		if nq == null:
			break
		answered += 1
		await _tap(nq, "next question")
	ok = await _wait(func(): return _find("Score") != null)
	_step("the recall quiz runs to a score", ok, "%d answered" % answered)
	_step("the best score is kept", int(App.chap(lesson.key).quiz) >= 0)
	await _shot("summary-quiz")
	await _tap("Mission4", "chapter 4 in the list")
	ok = await _wait(func(): return App.main.has_sheet() and _find("Go_read") != null)
	_step("a chapter in the list asks where to go", ok)
	await _tap("Go_read", "📄 Read")
	ok = await _wait(func(): return lesson.ch_no == 4 and lesson.tab == "read")
	_step("…and opens chapter 4 on Read", ok)
	await _tap("OptionsBtn", "⋯ options")
	ok = await _wait(func(): return App.main.has_sheet() and _find("AutoAdvance") != null)
	_step("⋯ shows listening options", ok)
	await _shot("options")
	await _back()
	# 7 · home again: continue card
	await _back()
	await _back()
	ok = await _wait(func(): return _top().name == "Home" and _find("ContinueCard") != null)
	_step("home offers Continue", ok)
	await _shot("home-continue")
	# 8 · hologram room
	await _tap("HoloRoom", "Hologram Room")
	ok = await _wait(func(): return _top().name == "HoloRoom" and _find("Figures") != null and _find("Figures").get_child_count() > 100, 10)
	_step("Hologram Room lists the figures", ok, "%d rows" % (_find("Figures").get_child_count() if _find("Figures") else 0))
	await _tap("Sub_phy", "Physics filter")
	await _frames(4)
	var phy_ok := true
	for c in _find("Figures").get_children():
		if str(c.name).begins_with("Fig_") and not str(c.name).begins_with("Fig_p"):
			phy_ok = false
	_step("the Physics filter shows only physics", phy_ok)
	await _shot("holo-room")
	await _back()
	# 9 · practice: tap & answer, save & exit, continue
	await _tap("PracticeCard", "Practice")
	ok = await _wait(func(): return _top().name == "Practice" and _find("StartBtn") != null, 10)
	_step("Practice opens", ok)
	await _shot("practice")
	await _tap("StartBtn", "start a round")
	ok = await _wait(func(): return _find("Opt0") != null)
	_step("a round starts", ok)
	var r: Dictionary = App.data.practice.round
	var right := int(r.qs[0].answer)
	await _tap("Opt%d" % right, "the right answer")
	ok = await _wait(func(): return _find("Feedback") != null)
	_step("the right answer is marked correct", ok and int(r.score) == 1)
	await _shot("practice-answered")
	await _tap("NextBtn", "next question")
	await _tap("SaveExit", "save & exit")
	ok = await _wait(func(): return _find("ContinueRound") != null)
	_step("Save & exit keeps the round", ok)
	await _tap("ContinueBtn", "continue")
	ok = await _wait(func(): return _find("Opt0") != null and int(App.data.practice.round.i) == 1)
	_step("Continue resumes at question 2", ok)
	await _tap("SaveExit", "save & exit")
	# 10 · shooter
	await _tap("Mode_shooter", "Space shooter mode")
	await _tap("StartBtn", "start the game")
	ok = await _wait(func(): return _top().name == "Shooter" and _top().game.ships.size() >= 2, 10)
	_step("the shooter starts with answer ships", ok)
	if ok:
		var g = _top().game
		g.manual = true
		for i in 5:
			g.step(0.016)
		await _shot("shooter")
		var s0: int = g.score
		g.shoot_option(int(g.q.answer))
		for i in 10:
			g.step(0.016)
		_step("hitting the right ship scores", g.score > s0, "score %d" % g.score)
		_step("the game is saved after the hit", int(App.data.practice.get("shooter", {}).get("score", -1)) == g.score)
		await _back()
		_step("Back pauses the game", g.paused and _find("PauseBox").visible)
		await _shot("shooter-paused")
		await _back()
		ok = await _wait(func(): return _top().name == "Practice" and _find("ContinueGame") != null)
		_step("second Back leaves, the game can be continued", ok)
	await _back()
	_step("Back returns home", _top().name == "Home")


func _moving_node(hv: HoloView) -> Node3D:
	if hv.anim == null:
		return null
	var a: Animation = hv.anim.get_animation("slider")
	var root := hv.anim.get_node(hv.anim.root_node)
	for t in a.get_track_count():
		if a.track_get_type(t) == Animation.TYPE_POSITION_3D:
			var n := root.get_node_or_null(NodePath(str(a.track_get_path(t)).get_slice(":", 0)))
			if n is Node3D:
				return n
	return null
