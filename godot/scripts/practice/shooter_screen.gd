class_name ShooterScreen
extends Screen
## Space shooter: each answer rides on a ship (one column per answer). Drag to steer, hold to fire, hit the
## ship with the right answer. Wrong hits and escaped answers cost a shield; levels add speed and ships.
## The game is saved after every hit and pauses on Back or when the app is hidden.

var sel: Array = []
var resume := false
var game: ShooterGame
var _q_label: Label
var _topic: Label
var _hint_l: Label
var _hud: Label
var _shields: HBoxContainer
var _pause_box: Control
var _over_box: Control


func _init(chapters: Array, resume_saved: bool) -> void:
	sel = chapters
	resume = resume_saved


func _ready() -> void:
	name = "Shooter"
	build("Space shooter", "Drag to steer · hold to fire")
	var root := Control.new()
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(root)
	game = ShooterGame.new()
	game.name = "Game"
	game.set_anchors_preset(Control.PRESET_FULL_RECT)
	game.screen = self
	root.add_child(game)
	# HUD + question (on top of the play field)
	var top := UI.vbox(8)
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 10
	top.offset_right = -10
	top.offset_top = 8
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var hud := UI.hbox(8)
	var pause := UI.icon_btn("pause", "Pause", 44, "card")
	pause.name = "PauseBtn"
	pause.pressed.connect(func() -> void: game.set_paused(true))
	hud.add_child(pause)
	_hud = UI.label("", 14, Color("#dbe7ff"), UI.f_mono)
	_hud.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hud.add_child(_hud)
	_shields = UI.hbox(5)
	_shields.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hud.add_child(_shields)
	hud.add_child(UI.spacer())
	var hint := UI.icon_btn("bulb", "Hint (half points)", 44, "card")
	hint.name = "HintBtn"
	hint.add_theme_color_override("icon_normal_color", UI.WARN)
	hint.pressed.connect(func() -> void: game.use_hint())
	hud.add_child(hint)
	top.add_child(hud)
	var qp := PanelContainer.new()
	qp.name = "QuestionPanel"
	qp.add_theme_stylebox_override("panel", UI.sb(Color(0.04, 0.06, 0.16, 0.82), 14, Color(0.47, 0.63, 1.0, 0.3), 1, Vector4(14, 8, 14, 10)))
	qp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var qcol := UI.vbox(2)
	_topic = UI.label("", 11, Color("#ff8fa3"), UI.f_mono)
	_topic.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	qcol.add_child(_topic)
	_q_label = UI.label("", 19, Color("#eaf2ff"), UI.f_bold, true)
	_q_label.name = "Question"
	_q_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	qcol.add_child(_q_label)
	_hint_l = UI.label("", 13, UI.WARN, null, true)
	_hint_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint_l.visible = false
	qcol.add_child(_hint_l)
	qp.add_child(qcol)
	top.add_child(qp)
	root.add_child(top)
	game.top_panel = top
	var help := UI.label("Drag to steer · hold to fire · bulb = hint (half points)", 12, Color("#7f95c9"))
	help.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	help.offset_top = -26
	help.offset_bottom = -6
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(help)
	_pause_box = _overlay_box("Paused", "Your game is saved. Continue now or later.", [["Resume", "primary", func() -> void: game.set_paused(false)], ["How to play", "card", _how], ["Save & exit", "ghost", _leave]])
	_pause_box.name = "PauseBox"
	root.add_child(_pause_box)
	await App.load_practice()
	game.start(sel, resume)


func _overlay_box(title: String, text: String, buttons: Array) -> Control:
	var o := ColorRect.new()
	o.color = Color(0.01, 0.02, 0.05, 0.72)
	o.set_anchors_preset(Control.PRESET_FULL_RECT)
	o.visible = false
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	var card := UI.card(18, UI.PANEL, 16, UI.BORDER2)
	card.custom_minimum_size.x = 300
	var b := UI.box(card)
	b.add_theme_constant_override("separation", 10)
	var t := UI.label(title, 22, UI.TEXT, UI.f_bold)
	t.name = "Title"
	b.add_child(t)
	var tx := UI.label(text, 14, UI.TEXT2, null, true)
	tx.name = "Text"
	b.add_child(tx)
	for btn in buttons:
		var x := UI.btn(btn[0], btn[1])
		x.name = str(btn[0]).replace(" ", "").replace("&", "")
		x.pressed.connect(btn[2])
		b.add_child(x)
	cc.add_child(card)
	o.add_child(cc)
	return o


func _how() -> void:
	var box := UI.vbox(8)
	for line in ["Each ship carries one answer. Steer under the right one and hold to fire.", "A wrong hit costs a shield. So does letting the right answer escape.", "Every 5 right answers: next level — faster ships, more answers.", "The bulb gives a hint for half the points.", "Back pauses the game; your game is saved after every hit."]:
		box.add_child(UI.label("• " + line, 14, UI.TEXT2, null, true))
	App.main.open_sheet("How to play", box, 480)


func _leave() -> void:
	game.save()
	App.main.back()


func on_back() -> bool:
	if App.main.has_sheet():
		return false
	if game.over:
		return false
	if not game.paused:
		game.set_paused(true)
		return true
	game.save()
	return false # second Back leaves (the game is saved)


func on_hide() -> void:
	if game and not game.over:
		game.save()


func show_paused(on: bool) -> void:
	_pause_box.visible = on


func update_hud() -> void:
	_hud.text = "SCORE %d · LV %d · streak %d" % [game.score, game.level, game.streak]
	UI.clear(_shields)
	for i in 3:
		var d := PanelContainer.new()
		d.custom_minimum_size = Vector2(12, 12)
		d.add_theme_stylebox_override("panel", UI.sb(UI.GOOD if i < game.shields else Color(1, 1, 1, 0.15), 6, Color(0, 0, 0, 0), 0, Vector4()))
		_shields.add_child(d)


func show_question(q: Dictionary, hint := "") -> void:
	_topic.text = ("%s · %s" % [q.get("chapter_title", ""), q.get("topic", "")]).to_upper()
	_q_label.text = str(q.get("q", ""))
	_hint_l.visible = hint != ""
	_hint_l.text = hint


func game_over() -> void:
	var best := int(App.data.practice.get("best_shooter", 0))
	if game.score > best:
		App.data.practice.best_shooter = game.score
	App.data.practice.erase("shooter")
	App.save()
	if _over_box:
		_over_box.queue_free()
	_over_box = _overlay_box("Game over", "Score %d · level %d · best %d" % [game.score, game.level, maxi(best, game.score)], [["Play again", "primary", _play_again], ["Back to practice", "card", App.main.back]])
	_over_box.name = "GameOver"
	game.get_parent().add_child(_over_box)
	_over_box.visible = true


func _play_again() -> void:
	_over_box.visible = false
	game.start(sel, false)


# ═════════════════════════════════════════════════════════════════════════════

class ShooterGame extends Control:
	const COLORS := [Color("#ff8fa3"), Color("#ffd166"), Color("#8ecae6"), Color("#c3aed6"), Color("#a7f3d0")]
	var screen
	var top_panel: Control
	var sel: Array = []
	var q := {}
	var ships: Array = [] # {x, y, w, text, i, alive}
	var bullets: Array = []
	var sparks: Array = [] # {p, v, life, c}
	var popups: Array = [] # {p, text, life, c}
	var stars: Array = []
	var px := 0.0
	var target_x := 0.0
	var firing := false
	var fire_cd := 0.0
	var score := 0
	var level := 1
	var streak := 0
	var right_in_level := 0
	var shields := 3
	var paused := false
	var over := false
	var hinted := false
	var manual := false # tests step the game themselves
	var _next_q := -1.0
	var _font: Font

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		_font = UI.f_bold
		for i in 90:
			stars.append(Vector3(randf(), randf(), randf_range(0.2, 1.0)))

	func start(chapters: Array, resume_saved: bool) -> void:
		while size.x <= 0: # wait for the layout: ships are placed by width
			await get_tree().process_frame
		sel = chapters
		over = false
		paused = false
		ships.clear()
		bullets.clear()
		var saved: Dictionary = App.data.practice.get("shooter", {}) if App.data.has("practice") else {}
		if resume_saved and not saved.is_empty():
			score = int(saved.score)
			level = int(saved.level)
			streak = int(saved.streak)
			right_in_level = int(saved.get("right", 0))
			shields = int(saved.shields)
			sel = saved.get("sel", sel)
			q = saved.get("q", {})
			hinted = bool(saved.get("hinted", false))
		else:
			score = 0
			level = 1
			streak = 0
			right_in_level = 0
			shields = 3
			q = {}
			hinted = false
		px = size.x * 0.5
		target_x = px
		if q.is_empty():
			_new_question()
		else:
			_spawn()
		screen.update_hud()
		screen.show_paused(false)
		save()

	func play_top() -> float:
		return (top_panel.position.y + top_panel.size.y + 12) if top_panel else 140.0

	func _options_for_level() -> int:
		return 2 if level == 1 else (3 if level == 2 else 4)

	func _new_question() -> void:
		hinted = false
		q = PracticeBank.make(sel, _options_for_level())
		_spawn()

	func _spawn() -> void:
		ships.clear()
		var n: int = q.get("options", []).size()
		if n == 0:
			return
		for i in n:
			var text := str(q.options[i])
			var tw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
			ships.append({"col": i, "x": 0.0, "y": play_top() + 20 + randf() * 30, "tw": tw, "w": 64.0, "text": text, "i": i, "alive": true, "c": COLORS[i % COLORS.size()]})
		_layout_ships()
		screen.show_question(q, PracticeBank.safe_hint(q) if hinted else "")

	## one column per answer, always from the current width (the field can be resized or rotated)
	func _layout_ships() -> void:
		if ships.is_empty() or size.x <= 0:
			return
		var colw := size.x / ships.size()
		for sh in ships:
			sh.x = (int(sh.col) + 0.5) * colw
			sh.w = clampf(float(sh.tw) + 34.0, 56.0, maxf(56.0, colw - 10.0))

	func use_hint() -> void:
		if over or paused or q.is_empty():
			return
		hinted = true
		screen.show_question(q, PracticeBank.safe_hint(q))
		save()

	func set_paused(on: bool) -> void:
		if over:
			return
		paused = on
		screen.show_paused(on)
		if on:
			save()

	func save() -> void:
		if over or q.is_empty():
			return
		if not App.data.has("practice") or not App.data.practice is Dictionary:
			App.data.practice = {}
		App.data.practice.shooter = {"score": score, "level": level, "streak": streak, "right": right_in_level, "shields": shields, "q": q, "hinted": hinted, "sel": sel}
		App.save()

	func _notification(what: int) -> void:
		if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
			if is_visible_in_tree() and not over and not App.autotest:
				set_paused(true)

	func _gui_input(e: InputEvent) -> void:
		if paused or over:
			return
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			firing = e.pressed
			target_x = e.position.x
			accept_event()
		elif e is InputEventMouseMotion and firing:
			target_x = e.position.x
			accept_event()

	func _unhandled_key_input(e: InputEvent) -> void:
		if not is_visible_in_tree() or over:
			return
		if e is InputEventKey:
			if e.keycode == KEY_SPACE:
				firing = e.pressed
			elif e.pressed and e.keycode == KEY_P:
				set_paused(not paused)

	func _process(dt: float) -> void:
		if not manual:
			step(minf(dt, 0.05))
		queue_redraw()

	## one frame of the game (tests call this directly with manual = true)
	func step(dt: float) -> void:
		for k in stars.size():
			var s: Vector3 = stars[k]
			s.y = fmod(s.y + dt * 0.03 * s.z, 1.0)
			stars[k] = s
		if paused or over:
			return
		_layout_ships()
		if Input.is_key_pressed(KEY_LEFT):
			target_x -= 420 * dt
		if Input.is_key_pressed(KEY_RIGHT):
			target_x += 420 * dt
		target_x = clampf(target_x, 20, size.x - 20)
		px = lerpf(px, target_x, minf(1.0, dt * 14))
		fire_cd -= dt
		if firing and fire_cd <= 0:
			fire()
		var speed := 22.0 + level * 7.0
		var ground := size.y - 92
		for sh in ships:
			if sh.alive:
				sh.y += speed * dt
		for b in bullets:
			b.y -= 560 * dt
		bullets = bullets.filter(func(b): return b.y > play_top() - 10)
		for b in bullets.duplicate():
			for sh in ships:
				if sh.alive and absf(b.x - sh.x) < sh.w * 0.5 + 4 and absf(b.y - sh.y) < 22:
					bullets.erase(b)
					_hit(sh)
					break
		for sp in sparks:
			sp.p += sp.v * dt
			sp.v *= 0.96
			sp.life -= dt
		sparks = sparks.filter(func(s): return s.life > 0)
		for p in popups:
			var pp: Vector2 = p.p
			pp.y -= 30 * dt
			p.p = pp
			p.life -= dt
		popups = popups.filter(func(p): return p.life > 0)
		if _next_q > 0:
			_next_q -= dt
			if _next_q <= 0:
				_next_q = -1
				_new_question()
				save()
			return
		for sh in ships:
			if sh.alive and sh.y > ground:
				if sh.i == int(q.answer):
					_lose_shield("The answer was %s" % sh.text)
					for o in ships:
						o.alive = false
					if not over:
						_next_q = 1.2
					return
				sh.alive = false

	func fire() -> void:
		bullets.append({"x": px, "y": size.y - 96})
		fire_cd = 0.16

	## tests: put the ship under answer i and fire
	func shoot_option(i: int) -> void:
		for sh in ships:
			if sh.alive and sh.i == i:
				px = sh.x
				target_x = sh.x
				bullets.append({"x": sh.x, "y": sh.y + 30})
				return

	func _hit(sh: Dictionary) -> void:
		sh.alive = false
		_burst(Vector2(sh.x, sh.y), sh.c)
		if sh.i == int(q.answer):
			var pts := (10 * level + mini(streak, 5) * 2) / (2 if hinted else 1)
			score += pts
			streak += 1
			right_in_level += 1
			popups.append({"p": Vector2(sh.x, sh.y), "text": "+%d" % pts, "life": 1.0, "c": UI.GOOD})
			for o in ships:
				if o.alive:
					o.alive = false
					_burst(Vector2(o.x, o.y), o.c)
			if right_in_level >= 5:
				level += 1
				right_in_level = 0
				popups.append({"p": Vector2(size.x * 0.5, size.y * 0.5), "text": "LEVEL %d" % level, "life": 1.6, "c": UI.ACCENT})
			_next_q = 0.6
		else:
			streak = 0
			popups.append({"p": Vector2(sh.x, sh.y), "text": "✗", "life": 0.8, "c": UI.BAD})
			_lose_shield("")
		screen.update_hud()
		save()

	func _lose_shield(msg: String) -> void:
		shields -= 1
		streak = 0
		screen.update_hud()
		if msg != "":
			popups.append({"p": Vector2(size.x * 0.5, size.y * 0.6), "text": msg, "life": 1.6, "c": UI.WARN})
		if shields <= 0:
			over = true
			screen.game_over()

	func _burst(at: Vector2, c: Color) -> void:
		for i in 22:
			var a := randf() * TAU
			sparks.append({"p": at, "v": Vector2(cos(a), sin(a)) * randf_range(60, 220), "life": randf_range(0.4, 0.9), "c": c})

	func _draw() -> void:
		_layout_ships()
		draw_rect(Rect2(Vector2.ZERO, size), Color("#03040c"))
		draw_rect(Rect2(0, 0, size.x, size.y * 0.6), Color(0.05, 0.08, 0.2, 0.35))
		for s in stars:
			draw_circle(Vector2(s.x * size.x, s.y * size.y), 0.6 + s.z * 1.1, Color(1, 1, 1, 0.25 + 0.5 * s.z))
		# ground line + city blocks (what you protect)
		var gy := size.y - 46
		for i in int(size.x / 34) + 1:
			var hh := 14.0 + (i * 37 % 4) * 6.0
			draw_rect(Rect2(i * 34 + 4, gy - hh + 12, 26, hh), Color(0.15, 0.25, 0.6, 0.55))
		draw_line(Vector2(0, gy + 12), Vector2(size.x, gy + 12), Color(0.4, 0.55, 1.0, 0.5), 2)
		for sh in ships:
			if not sh.alive:
				continue
			var r := Rect2(sh.x - sh.w * 0.5, sh.y - 20, sh.w, 40)
			draw_colored_polygon(PackedVector2Array([Vector2(r.position.x - 14, sh.y), Vector2(r.position.x + 8, sh.y - 9), Vector2(r.position.x + 8, sh.y + 9)]), Color(0.25, 0.35, 0.75))
			draw_colored_polygon(PackedVector2Array([Vector2(r.end.x + 14, sh.y), Vector2(r.end.x - 8, sh.y - 9), Vector2(r.end.x - 8, sh.y + 9)]), Color(0.25, 0.35, 0.75))
			var st := UI.sb(sh.c, 20, Color(1, 1, 1, 0.8), 2, Vector4())
			draw_style_box(st, r)
			var ts := _font.get_string_size(sh.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 18)
			draw_string(_font, Vector2(sh.x - minf(ts.x, sh.w - 16) * 0.5, sh.y + 6), sh.text, HORIZONTAL_ALIGNMENT_LEFT, sh.w - 16, 18, Color("#0b1020"))
		for b in bullets:
			draw_line(Vector2(b.x, b.y), Vector2(b.x, b.y + 12), Color("#7dd3fc"), 3)
		# the player's ship
		var y := size.y - 80
		draw_colored_polygon(PackedVector2Array([Vector2(px, y - 28), Vector2(px - 20, y + 10), Vector2(px + 20, y + 10)]), Color("#cfe8ff"))
		draw_colored_polygon(PackedVector2Array([Vector2(px, y - 22), Vector2(px - 14, y + 6), Vector2(px + 14, y + 6)]), Color("#3b82f6"))
		draw_circle(Vector2(px, y - 4), 5, Color("#e0f2ff"))
		draw_colored_polygon(PackedVector2Array([Vector2(px - 6, y + 10), Vector2(px + 6, y + 10), Vector2(px, y + 22 + randf() * 5)]), Color("#f59e0b"))
		for sp in sparks:
			draw_circle(sp.p, 2.2, Color(sp.c, clampf(sp.life * 1.6, 0, 1)))
		for p in popups:
			draw_string(_font, p.p - Vector2(60, 0), p.text, HORIZONTAL_ALIGNMENT_CENTER, 120, 20, Color(p.c, clampf(p.life, 0, 1)))
