class_name PracticeScreen
extends Screen
## Practice: choose chapters and a mode — Tap & answer (rounds of 10 MCQs) or Space shooter. A round is
## saved after every answer, so "Continue" resumes exactly where you left off.

const ROUND := 10

var _col: VBoxContainer
var _mode := "tap"
var _sel: Array = []
var _answered := false


func _ready() -> void:
	name = "Practice"
	build("Practice", "Loading questions…")
	_col = UI.vbox(14)
	_col.name = "PracticeBody"
	body.add_child(UI.scroller(UI.pad(_col, 16, 14, 16, 28), 720))
	var st := _state()
	_mode = str(st.get("mode", "tap"))
	_sel = st.get("sel", []).duplicate()
	await App.load_practice()
	_home()


func on_resume() -> void:
	if str(_state().get("view", "")) != "round":
		_home()


func on_back() -> bool:
	# leaving a round goes back to the practice home (the round stays saved)
	if str(_state().get("view", "")) == "round":
		_state().view = "home"
		App.save()
		_home()
		return true
	return false


func _state() -> Dictionary:
	if not App.data.has("practice") or not App.data.practice is Dictionary:
		App.data.practice = {}
	return App.data.practice


func _clear() -> void:
	UI.clear(_col)


# ───────── home ─────────

func _home() -> void:
	_clear()
	_state().view = "home"
	set_titles("Practice", "Class 10 maths · algebra drill · %d questions" % _total())
	var st := _state()
	var round: Dictionary = st.get("round", {})
	if not round.is_empty() and int(round.get("i", 0)) < ROUND:
		var c := UI.card(14, UI.CARD, 16, Color(UI.WARN, 0.45))
		c.name = "ContinueRound"
		UI.box(c).add_child(UI.eyebrow("Continue · Tap & answer", UI.WARN))
		UI.box(c).add_child(UI.label("Question %d of %d · %d correct so far" % [int(round.i) + 1, ROUND, int(round.score)], 15, UI.TEXT, UI.f_semi))
		var row := UI.hbox(8)
		var go := UI.btn("Continue", "primary", "play", UI.WARN)
		go.name = "ContinueBtn"
		go.pressed.connect(_show_question)
		row.add_child(go)
		var drop := UI.btn("Discard", "ghost")
		drop.pressed.connect(func() -> void:
			st.erase("round")
			App.save()
			_home())
		row.add_child(drop)
		UI.box(c).add_child(row)
		_col.add_child(c)
	var shooter: Dictionary = st.get("shooter", {})
	if not shooter.is_empty() and int(shooter.get("shields", 0)) > 0:
		var c2 := UI.card(14, UI.CARD, 16, Color(UI.ACCENT, 0.45))
		c2.name = "ContinueShooter"
		UI.box(c2).add_child(UI.eyebrow("Continue · Space shooter", UI.ACCENT))
		UI.box(c2).add_child(UI.label("Level %d · score %d · %d shields left" % [int(shooter.level), int(shooter.score), int(shooter.shields)], 15, UI.TEXT, UI.f_semi))
		var go2 := UI.btn("Continue the game", "primary", "rocket")
		go2.name = "ContinueGame"
		go2.pressed.connect(func() -> void: App.push(ShooterScreen.new(_sel, true)))
		UI.box(c2).add_child(go2)
		_col.add_child(c2)
	_col.add_child(UI.eyebrow("Mode"))
	var modes := UI.hbox(10)
	for m in [["tap", "Tap & answer", "practice", "10 questions, an explanation after each"], ["shooter", "Space shooter", "rocket", "Shoot the ship carrying the answer"]]:
		var tc := TapCard.new(14, UI.CARD2 if _mode == m[0] else UI.CARD, 14, UI.ACCENT if _mode == m[0] else UI.BORDER)
		tc.name = "Mode_" + m[0]
		tc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		UI.box(tc).add_child(UI.icon_rect(m[2], 24, UI.ACCENT if _mode == m[0] else UI.MUTED))
		UI.box(tc).add_child(UI.label(m[1], 15, UI.TEXT, UI.f_bold))
		UI.box(tc).add_child(UI.label(m[3], 12, UI.MUTED, null, true))
		tc.tapped.connect(func() -> void:
			_mode = m[0]
			st.mode = _mode
			App.save()
			_home())
		modes.add_child(tc)
	_col.add_child(modes)
	_col.add_child(UI.eyebrow("Chapters"))
	var all := UI.btn("All chapters", "chip_on" if _sel.is_empty() else "chip")
	all.name = "AllChapters"
	all.pressed.connect(func() -> void:
		_sel.clear()
		st.sel = _sel
		App.save()
		_home())
	_col.add_child(all)
	for g in PracticeBank.groups():
		_col.add_child(UI.label(str(g.title), 13, UI.TEXT2, UI.f_semi))
		var flow := HFlowContainer.new()
		flow.add_theme_constant_override("h_separation", 6)
		flow.add_theme_constant_override("v_separation", 6)
		for c in PracticeBank.chapters():
			if c.group != g.id:
				continue
			var on: bool = c.id in _sel
			var b := UI.btn(str(c.title), "chip_on" if on else "chip", "", Color(str(c.color)))
			b.name = "Ch_" + str(c.id)
			b.pressed.connect(func() -> void:
				if c.id in _sel:
					_sel.erase(c.id)
				else:
					_sel.append(c.id)
				st.sel = _sel
				App.save()
				_home())
			flow.add_child(b)
		_col.add_child(flow)
	var start := UI.btn("Start · Tap & answer" if _mode == "tap" else "Start · Space shooter", "primary", "play")
	start.name = "StartBtn"
	start.custom_minimum_size.y = 52
	start.pressed.connect(_start)
	_col.add_child(UI.spacer(0, 4))
	_col.add_child(start)


func _total() -> int:
	var n := 0
	for c in PracticeBank.chapters():
		for g in c.gens:
			n += g.size()
	return n


func _start() -> void:
	if _mode == "shooter":
		_state().erase("shooter")
		App.save()
		App.push(ShooterScreen.new(_sel, false))
		return
	var qs: Array = []
	var seen := {}
	for i in ROUND:
		var q := PracticeBank.make(_sel, 4, seen)
		if q.is_empty():
			break
		seen[q.q] = true
		qs.append(q)
	_state().round = {"qs": qs, "i": 0, "score": 0, "streak": 0, "picked": -1}
	App.save()
	_show_question()


# ───────── a round ─────────

func _show_question() -> void:
	_clear()
	var st := _state()
	st.view = "round"
	var r: Dictionary = st.round
	if int(r.i) >= r.qs.size():
		_done()
		return
	var q: Dictionary = r.qs[int(r.i)]
	var color := Color(str(q.get("color", "#4fd1e8")))
	set_titles("Practice", "Tap & answer · question %d of %d" % [int(r.i) + 1, r.qs.size()])
	var top := UI.hbox(10)
	var leave := UI.btn("Save & exit", "card", "back")
	leave.name = "SaveExit"
	leave.pressed.connect(func() -> void:
		st.view = "home"
		App.save()
		_home())
	top.add_child(leave)
	var pb := UI.bar(float(r.i) / r.qs.size(), color, 6)
	pb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(pb)
	top.add_child(UI.label("%d/%d  ✓%d  streak %d" % [int(r.i) + 1, r.qs.size(), int(r.score), int(r.streak)], 12, UI.MUTED, UI.f_mono))
	_col.add_child(top)
	var tags := HFlowContainer.new()
	tags.add_theme_constant_override("h_separation", 6)
	for t in [str(q.get("chapter_title", "")), str(q.get("topic", ""))]:
		if t == "":
			continue
		var p := PanelContainer.new()
		p.add_theme_stylebox_override("panel", UI.sb(Color(color, 0.1), 8, Color(color, 0.5), 1, Vector4(8, 3, 8, 3)))
		p.add_child(UI.label(t.to_upper(), 11, color, UI.f_mono))
		tags.add_child(p)
	_col.add_child(tags)
	_col.add_child(UI.label(str(q.q), 22, UI.TEXT, UI.f_semi, true))
	var opts := UI.vbox(10)
	opts.name = "Options"
	_answered = int(r.get("picked", -1)) >= 0
	for i in q.options.size():
		var b := UI.btn("", "card")
		b.name = "Opt%d" % i
		b.custom_minimum_size.y = 56
		var row := UI.hbox(12)
		row.set_anchors_preset(Control.PRESET_FULL_RECT)
		row.offset_left = 12
		row.offset_right = -12
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var letter := PanelContainer.new()
		letter.add_theme_stylebox_override("panel", UI.sb(UI.BG, 8, Color(0, 0, 0, 0), 0, Vector4(10, 4, 10, 4)))
		letter.add_child(UI.label(char(65 + i), 14, UI.TEXT2, UI.f_mono))
		letter.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(letter)
		var ol := UI.label(str(q.options[i]), 18, UI.TEXT, UI.f_med)
		ol.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(ol)
		b.add_child(row)
		b.pressed.connect(_pick.bind(i))
		opts.add_child(b)
	_col.add_child(opts)
	if _answered:
		_feedback(int(r.picked))


func _pick(i: int) -> void:
	if _answered:
		return
	var st := _state()
	var r: Dictionary = st.round
	var q: Dictionary = r.qs[int(r.i)]
	_answered = true
	r.picked = i
	if i == int(q.answer):
		r.score = int(r.score) + 1
		r.streak = int(r.streak) + 1
	else:
		r.streak = 0
	App.save()
	_feedback(i)


func _feedback(i: int) -> void:
	var r: Dictionary = _state().round
	var q: Dictionary = r.qs[int(r.i)]
	var right := int(q.answer)
	var opts := _col.get_node_or_null("Options")
	if opts:
		for j in opts.get_child_count():
			var b: Button = opts.get_child(j)
			if j == right:
				UI.style_btn(b, "soft", UI.GOOD)
			elif j == i:
				UI.style_btn(b, "soft", UI.BAD)
	var ok: bool = i == right
	var c := UI.card(14, UI.CARD, 14, Color(UI.GOOD if ok else UI.BAD, 0.5))
	c.name = "Feedback"
	UI.box(c).add_child(UI.label("✓ Correct" if ok else "✗ Not quite — the answer is %s" % q.options[right], 17, UI.GOOD if ok else UI.BAD, UI.f_bold, true))
	if str(q.get("hint", "")) != "":
		UI.box(c).add_child(UI.label(str(q.hint), 15, UI.TEXT2, null, true))
	_col.add_child(c)
	var nxt := UI.btn("Next question" if int(r.i) < r.qs.size() - 1 else "See your score", "primary", "chev")
	nxt.name = "NextBtn"
	nxt.custom_minimum_size.y = 52
	nxt.pressed.connect(func() -> void:
		r.i = int(r.i) + 1
		r.picked = -1
		App.save()
		_show_question())
	_col.add_child(nxt)


func _done() -> void:
	var st := _state()
	var r: Dictionary = st.round
	var n: int = r.qs.size()
	var score := int(r.score)
	st.erase("round")
	st.view = "home"
	st.best_tap = maxi(int(st.get("best_tap", 0)), score)
	App.save()
	_clear()
	set_titles("Practice", "Round complete")
	var big := UI.label("%d / %d" % [score, n], 40, UI.GOOD if score * 2 >= n else UI.WARN, UI.f_bold)
	big.name = "RoundScore"
	big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_col.add_child(UI.spacer(0, 20))
	_col.add_child(big)
	var msg := "Excellent!" if score >= n - 1 else ("Good work — keep going." if score * 2 >= n else "Keep practising — read each explanation.")
	var ml := UI.label(msg, 16, UI.TEXT2, null, true)
	ml.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_col.add_child(ml)
	var again := UI.btn("Another round", "primary", "replay")
	again.name = "AgainBtn"
	again.pressed.connect(_start)
	_col.add_child(again)
	var home := UI.btn("Choose chapters", "card")
	home.pressed.connect(_home)
	_col.add_child(home)
