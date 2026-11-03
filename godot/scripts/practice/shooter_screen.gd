class_name ShooterScreen
extends Screen
## Space shooter: each answer rides on a drone (one column per answer). Your ship, an eagle, follows the mouse
## (click or Space to fire); on a touch screen drag anywhere to aim and lift your finger to fire, so steering
## past a wrong answer never shoots it. Hit the drone with the right answer. Wrong hits and escaped answers cost
## a shield; levels add speed and drones. Pixel art and effects: scripts/practice/pixel_art.gd.
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
var _touch := false
var _help: Label
var _help_gone := false


## the controls line fades away after the first shot (How to play in the pause menu keeps it)
func hide_help() -> void:
	if _help and not _help_gone:
		_help_gone = true
		var tw := create_tween()
		tw.tween_interval(1.5)
		tw.tween_property(_help, "modulate:a", 0.0, 0.6)
		tw.tween_callback(func() -> void: _help.visible = false)


func _init(chapters: Array, resume_saved: bool) -> void:
	sel = chapters
	resume = resume_saved


func _ready() -> void:
	name = "Shooter"
	_touch = DisplayServer.is_touchscreen_available()
	build("Space shooter", "Drag to aim · lift to fire" if _touch else "Your ship follows the mouse · click to fire")
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
	qp.add_theme_stylebox_override("panel", UI.sb(Color(0.04, 0.06, 0.16, 0.86), 6, Color(0.47, 0.63, 1.0, 0.35), 2, Vector4(14, 8, 14, 10)))
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
	var help := UI.label(("Drag anywhere to aim · lift your finger to fire" if _touch else "Move the mouse to steer · click or Space to fire") + " · bulb = hint (half points)", 12, Color("#7f95c9"))
	help.name = "Help"
	help.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	help.offset_top = -28
	help.offset_bottom = -6
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	help.add_theme_stylebox_override("normal", UI.sb(Color(0.02, 0.03, 0.1, 0.78), 4, Color(0, 0, 0, 0), 0, Vector4(8, 3, 8, 3)))
	help.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(help)
	_help = help
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
	var steer := "Drag anywhere to move your ship; lift your finger to fire. A tap fires without moving." if _touch \
		else "Your ship follows the mouse. Click to fire, hold for rapid fire. Arrow keys and Space work too."
	for line in ["Each drone carries one answer. Hit the drone with the right one.", steer,
			"The drones wait while you read the question, then start to fall.",
			"A wrong hit costs a shield. So does letting the right answer reach the city.",
			"Every 5 right answers: next level, with faster drones and more answers. Right answers in a row score more.",
			"The bulb gives a hint for half the points.", "Back pauses the game; your game is saved after every hit."]:
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
		d.add_theme_stylebox_override("panel", UI.sb(UI.GOOD if i < game.shields else Color(1, 1, 1, 0.15), 2, Color(0, 0, 0, 0), 0, Vector4()))
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
	const SKY := [Color("#04061a"), Color("#060a21"), Color("#080d28"), Color("#0b1130"), Color("#0e1638"), Color("#121b41")]
	const PLATE_H := 34.0
	const BOLT_SPEED := 900.0
	var screen
	var top_panel: Control
	var sel: Array = []
	var q := {}
	var ships: Array = [] # {col, x, y, ty, w, tw, text, i, alive, flee, a, c}
	var bullets: Array = [] # {x, y}
	var sparks: Array = [] # explosion squares {p, v, life, max, s, g, fire, c}
	var rings: Array = [] # shock rings {p, life, max, r, c}
	var trail: Array = [] # engine trail {p, v, life}
	var popups: Array = [] # {p, text, life, c, px (0 = normal font)}
	var stars: Array = [] # Vector3(x, y, depth)
	var px := 0.0
	var target_x := 0.0
	var tilt := 0.0
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
	var _t := 0.0 # clock for animation frames
	var _enter := 0.0 # drones sliding in under the question
	var _hold := 0.0 # reading time before the drones start to fall
	var _freeze := 0.0 # hit-stop after a right hit
	var _shake := 0.0
	var _off := Vector2.ZERO # this frame's shake offset
	var _flash := 0.0 # red edge after a wrong hit
	var _blink := 0.0 # the ship blinks after losing a shield
	var _warp := 0.0 # level-up: stars stretch into streaks
	var _muzzle := 0.0
	var _trail_cd := 0.0
	var _hover := false # the mouse is over the play field (its pointer is hidden: the ship is the pointer)
	var _touch_id := -1 # the finger that steers (relative drag)
	var _touch_x0 := 0.0
	var _ship_x0 := 0.0
	var _saw_touch := false
	var _city := {}
	var _city_cells := -1
	var _planet: ImageTexture

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_STOP
		texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_font = UI.f_bold
		for i in 120:
			stars.append(Vector3(randf(), randf(), [0.25, 0.55, 1.0][i % 3]))
		_planet = PixelArt.planet(22, Color("#7a5aa6"))

	func _exit_tree() -> void:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

	## size of one art pixel on screen (4 on a phone)
	func pix() -> float:
		return clampf(roundf(size.x / 105.0), 3.0, 5.0)

	func ship_y() -> float:
		return size.y - 20.0 * pix() - 6.0

	## a drone whose answer passes this line has reached the city
	func ground_y() -> float:
		return ship_y() - 9.5 * pix() - 8.0

	func start(chapters: Array, resume_saved: bool) -> void:
		while size.x <= 0: # wait for the layout: drones are placed by width
			await get_tree().process_frame
		sel = chapters
		over = false
		paused = false
		ships.clear()
		bullets.clear()
		sparks.clear()
		rings.clear()
		trail.clear()
		popups.clear()
		firing = false
		_touch_id = -1
		_freeze = 0.0
		_shake = 0.0
		_flash = 0.0
		_blink = 0.0
		_warp = 0.0
		_next_q = -1.0
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
			ships.append({"col": i, "x": 0.0, "y": play_top() - 40.0, "ty": play_top() + 52.0 + randf() * 18.0, "tw": tw, "w": 64.0,
				"text": text, "i": i, "alive": true, "flee": false, "a": 1.0, "c": COLORS[i % COLORS.size()]})
		_layout_ships()
		_enter = 0.45
		# time to read the question before the drones fall: longer questions get longer
		_hold = clampf(0.8 + str(q.get("q", "")).length() * 0.022, 1.2, 4.0)
		screen.show_question(q, PracticeBank.safe_hint(q) if hinted else "")

	## one column per answer, always from the current width (the field can be resized or rotated)
	func _layout_ships() -> void:
		if ships.is_empty() or size.x <= 0:
			return
		var colw := size.x / ships.size()
		var p := pix()
		for sh in ships:
			if bool(sh.flee):
				continue
			sh.x = (int(sh.col) + 0.5) * colw
			sh.w = clampf(float(sh.tw) + 6.0 * p + 12.0, 64.0, maxf(64.0, colw - 10.0))

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
		firing = false
		_touch_id = -1
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
		elif what == NOTIFICATION_MOUSE_ENTER:
			_hover = true
		elif what == NOTIFICATION_MOUSE_EXIT:
			_hover = false

	## the mouse pointer is hidden over the play field while you play: the ship is the pointer
	func _update_pointer() -> void:
		var hide: bool = _hover and not paused and not over and is_visible_in_tree() and not App.autotest and not App.main.has_sheet()
		var want := Input.MOUSE_MODE_HIDDEN if hide else Input.MOUSE_MODE_VISIBLE
		if Input.mouse_mode != want:
			Input.mouse_mode = want

	func _gui_input(e: InputEvent) -> void:
		if paused or over:
			return
		if e is InputEventScreenTouch:
			_saw_touch = true
			_touch_press(e.index, e.position.x, e.pressed)
			accept_event()
		elif e is InputEventScreenDrag:
			_touch_drag(e.index, e.position.x)
			accept_event()
		elif e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			if e.device == InputEvent.DEVICE_ID_EMULATION: # a finger, copied as a mouse click
				if not _saw_touch:
					_touch_press(0, e.position.x, e.pressed)
			else:
				firing = e.pressed
				target_x = e.position.x
				if e.pressed and fire_cd <= 0:
					fire()
			accept_event()
		elif e is InputEventMouseMotion:
			if e.device == InputEvent.DEVICE_ID_EMULATION:
				if not _saw_touch:
					_touch_drag(0, e.position.x)
			else:
				target_x = e.position.x
				_hover = true
			accept_event()

	# touch: the ship moves by the finger's movement (the finger can be anywhere, it never covers the ship);
	# lifting the finger fires, so sliding past a wrong answer never shoots it
	func _touch_press(index: int, x: float, pressed: bool) -> void:
		if pressed:
			if _touch_id < 0:
				_touch_id = index
				_touch_x0 = x
				_ship_x0 = target_x
		elif index == _touch_id:
			_touch_id = -1
			fire()

	func _touch_drag(index: int, x: float) -> void:
		if index == _touch_id:
			target_x = _ship_x0 + (x - _touch_x0) * 1.35

	func _unhandled_key_input(e: InputEvent) -> void:
		if not is_visible_in_tree() or over:
			return
		if e is InputEventKey:
			if e.keycode == KEY_SPACE:
				if e.pressed and not e.echo and not paused and fire_cd <= 0:
					fire()
				firing = e.pressed and not paused
			elif e.pressed and e.keycode == KEY_P:
				set_paused(not paused)

	func _process(dt: float) -> void:
		_update_pointer()
		if not manual:
			step(minf(dt, 0.05))
		queue_redraw()

	## one frame of the game (tests call this directly with manual = true)
	func step(dt: float) -> void:
		_t += dt
		var warp := 1.0 + _warp * 16.0
		for k in stars.size():
			var s: Vector3 = stars[k]
			s.y = fmod(s.y + dt * 0.018 * s.z * warp * (1.0 + level * 0.06), 1.0)
			stars[k] = s
		if paused:
			return
		_warp = maxf(0.0, _warp - dt)
		_shake = move_toward(_shake, 0.0, dt * 38.0)
		_flash = maxf(0.0, _flash - dt * 2.4)
		_blink = maxf(0.0, _blink - dt)
		_muzzle = maxf(0.0, _muzzle - dt)
		_update_fx(dt)
		if over:
			return
		if _freeze > 0:
			_freeze -= dt
			return
		_layout_ships()
		var p := pix()
		if Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A):
			target_x -= 520 * dt
		if Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D):
			target_x += 520 * dt
		target_x = clampf(target_x, 12.0 * p, size.x - 12.0 * p)
		px = lerpf(px, target_x, 1.0 - exp(-dt * 20.0))
		tilt = lerpf(tilt, clampf((target_x - px) / 26.0, -1.0, 1.0), 1.0 - exp(-dt * 12.0))
		fire_cd -= dt
		if firing and fire_cd <= 0:
			fire()
		_trail_cd -= dt
		if _trail_cd <= 0:
			_trail_cd = 0.024
			trail.append({"p": Vector2(px + randf_range(-1.5, 1.5) * p, ship_y() + 11.0 * p), "v": Vector2(randf_range(-12, 12), 150), "life": 0.34})
		# drones: slide in, wait while the question is read, then fall
		var speed := minf(18.0 + level * 6.0, 70.0)
		if _enter > 0:
			_enter -= dt
			for sh in ships:
				if sh.alive:
					sh.y = lerpf(float(sh.y), float(sh.ty), 1.0 - exp(-dt * 12.0))
		elif _hold > 0:
			_hold -= dt
		else:
			for sh in ships:
				if sh.alive:
					sh.y += speed * dt
		# bolts: hit first, then drop the ones that left the field
		for b in bullets.duplicate():
			b.y -= BOLT_SPEED * dt
			for sh in ships:
				if sh.alive and _hits(b, sh):
					bullets.erase(b)
					_hit(sh)
					break
		bullets = bullets.filter(func(b): return b.y > play_top() - 10)
		if _next_q > 0:
			_next_q -= dt
			if _next_q <= 0:
				_next_q = -1
				_new_question()
				save()
			return
		for sh in ships:
			if sh.alive and sh.y > ground_y():
				if sh.i == int(q.answer):
					_flash = 0.6
					_shake = 6.0
					_lose_shield("The answer was %s" % sh.text)
					for o in ships:
						o.alive = false
					if not over:
						_next_q = 1.2
					return
				sh.alive = false

	func _hits(b: Dictionary, sh: Dictionary) -> bool:
		var y := float(sh.y)
		return absf(float(b.x) - float(sh.x)) < float(sh.w) * 0.5 + 6.0 and float(b.y) < y + PLATE_H * 0.5 + 4.0 and float(b.y) > y - PLATE_H * 0.5 - 28.0

	func _update_fx(dt: float) -> void:
		for s in sparks:
			s.p += s.v * dt
			s.v *= pow(0.06, dt)
			s.v.y += float(s.g) * dt
			s.life -= dt
		sparks = sparks.filter(func(s): return s.life > 0)
		for r in rings:
			r.life -= dt
		rings = rings.filter(func(r): return r.life > 0)
		for t in trail:
			t.p += t.v * dt
			t.life -= dt
		trail = trail.filter(func(t): return t.life > 0)
		for pp in popups:
			var at: Vector2 = pp.p
			at.y -= 34 * dt
			pp.p = at
			pp.life -= dt
		popups = popups.filter(func(pp): return pp.life > 0)
		for sh in ships: # wrong answers power down: they drop away and fade
			if bool(sh.flee):
				sh.y += (90.0 + 520.0 * (1.0 - float(sh.a))) * dt
				sh.a = maxf(0.0, float(sh.a) - dt * 2.2)

	func fire() -> void:
		bullets.append({"x": px, "y": ship_y() - 8.0 * pix()})
		fire_cd = 0.17
		_muzzle = 0.06
		screen.hide_help()

	## tests: put the ship under answer i and fire
	func shoot_option(i: int) -> void:
		_enter = 0.0
		for sh in ships:
			if sh.alive:
				sh.y = sh.ty
		for sh in ships:
			if sh.alive and sh.i == i:
				px = sh.x
				target_x = sh.x
				bullets.append({"x": sh.x, "y": float(sh.y) + 10.0})
				return

	func _hit(sh: Dictionary) -> void:
		sh.alive = false
		var at := Vector2(float(sh.x), float(sh.y))
		if sh.i == int(q.answer):
			var pts := (10 * level + mini(streak, 5) * 2) / (2 if hinted else 1)
			score += pts
			streak += 1
			right_in_level += 1
			_explode(at, sh.c, 1.0)
			_freeze = 0.07
			_shake = 5.0
			popups.append({"p": at + Vector2(0, 6), "text": "+%d" % pts, "life": 1.1, "c": Color("#7cf0a0"), "px": 1.0})
			if streak >= 2:
				popups.append({"p": Vector2(px, ship_y() - 54), "text": "STREAK x%d" % streak, "life": 1.0, "c": Color("#ffd166"), "px": 0.75})
			for o in ships: # the wrong answers fly away
				if o.alive:
					o.alive = false
					o.flee = true
			if right_in_level >= 5:
				level += 1
				right_in_level = 0
				_warp = 1.1
				popups.append({"p": Vector2(size.x * 0.5, (play_top() + ground_y()) * 0.5), "text": "LEVEL %d" % level, "life": 1.6, "c": Color("#8ff0ff"), "px": 2.0})
			_next_q = 0.7
		else:
			streak = 0
			_explode(at, Color("#ff6b6b"), 0.7)
			_shake = 8.0
			_flash = 1.0
			_blink = 0.7
			popups.append({"p": at + Vector2(0, 6), "text": "WRONG", "life": 0.9, "c": Color("#ff7b7b"), "px": 0.75})
			_lose_shield("")
		screen.update_hud()
		save()

	func _lose_shield(msg: String) -> void:
		shields -= 1
		streak = 0
		screen.update_hud()
		if msg != "":
			popups.append({"p": Vector2(size.x * 0.5, ground_y() - 40), "text": msg, "life": 1.8, "c": UI.WARN, "px": 0.0})
		if shields <= 0:
			over = true
			firing = false
			_explode(Vector2(px, ship_y()), Color("#ffd166"), 1.6)
			_shake = 12.0
			get_tree().create_timer(0.9).timeout.connect(func() -> void:
				if is_instance_valid(screen) and over:
					screen.game_over())

	## a pixel explosion: fire squares (white → yellow → red → smoke), debris in the drone's colour, a shock ring
	func _explode(at: Vector2, c: Color, power: float) -> void:
		var p := pix()
		for i in int(26 * power) + 10:
			var a := randf() * TAU
			var life := randf_range(0.35, 0.8)
			sparks.append({"p": at, "v": Vector2(cos(a), sin(a)) * randf_range(40, 270) * power, "life": life, "max": life,
				"s": p * randf_range(0.7, 1.7), "g": 50.0, "fire": true, "c": c})
		for i in 8:
			var a := randf() * TAU
			sparks.append({"p": at, "v": Vector2(cos(a), sin(a) - 0.6) * randf_range(80, 200) * power, "life": 0.9, "max": 0.9,
				"s": p * 1.5, "g": 320.0, "fire": false, "c": c})
		rings.append({"p": at, "life": 0.38, "max": 0.38, "r": 64.0 * power, "c": c})

	# ───────── drawing ─────────

	func _draw() -> void:
		_layout_ships()
		var p := pix()
		_off = Vector2(randf_range(-1, 1), randf_range(-1, 1)).round() * _shake if _shake > 0.3 else Vector2.ZERO
		draw_set_transform(_off)
		var bh := size.y / SKY.size()
		for i in SKY.size():
			draw_rect(Rect2(-16, i * bh, size.x + 32, bh + 1), SKY[i])
		var ps := Vector2(_planet.get_size()) * p
		draw_texture_rect(_planet, Rect2(Vector2(size.x - ps.x * 0.8, play_top() + 24 + sin(_t * 0.2) * 3.0).round(), ps), false, Color(1, 1, 1, 0.8))
		for s in stars:
			var at := Vector2(floorf(s.x * size.x), floorf(s.y * size.y))
			var sz := 1.0 if s.z < 0.4 else (2.0 if s.z < 0.8 else maxf(2.0, p * 0.67))
			var al: float = (0.3 + 0.6 * s.z) * (0.75 + 0.25 * sin(_t * 3.0 + s.x * 40.0))
			if _warp > 0:
				var ln: float = _warp * 46.0 * s.z
				draw_rect(Rect2(at.x, at.y - ln, sz, sz + ln), Color(0.75, 0.88, 1, al))
			else:
				draw_rect(Rect2(at, Vector2(sz, sz)), Color(0.86, 0.92, 1, al))
		_draw_city(p)
		var gy := roundf(ground_y())
		var dash := int(p * 4)
		for x in range(0, int(size.x), dash):
			draw_rect(Rect2(x, gy, p * 2, 1), Color(1, 0.45, 0.55, 0.28))
		for sh in ships:
			_draw_drone(sh, p)
		for b in bullets:
			var bx := roundf(float(b.x) - p)
			draw_rect(Rect2(bx, b.y + p * 5, p * 2, p * 4), Color(0.3, 0.8, 1, 0.3))
			draw_rect(Rect2(bx, b.y, p * 2, p * 5), Color("#8ff0ff"))
			draw_rect(Rect2(bx + p * 0.5, b.y + p, p, p * 3), Color.WHITE)
		for t in trail:
			var k := 1.0 - float(t.life) / 0.34
			var tc := Color("#8ff0ff").lerp(Color("#2f5fd8"), k)
			draw_rect(Rect2(t.p.round(), Vector2(p, p)), Color(tc, 1.0 - k))
		if not over and (_blink <= 0 or fmod(_blink, 0.14) > 0.07):
			_draw_eagle(p)
		for s in sparks:
			var k := 1.0 - float(s.life) / float(s.max)
			var c: Color = PixelArt.FIRE[mini(int(k * PixelArt.FIRE.size()), PixelArt.FIRE.size() - 1)] if bool(s.fire) else Color(s.c).darkened(k * 0.4)
			var sz := roundf(float(s.s))
			draw_rect(Rect2(s.p.round(), Vector2(sz, sz)), Color(c, clampf(float(s.life) * 2.2, 0, 1)))
		for r in rings:
			var k := 1.0 - float(r.life) / float(r.max)
			var rad := float(r.r) * (1.0 - pow(1.0 - k, 3.0))
			for i in 22:
				var a := TAU * i / 22.0
				var at: Vector2 = (r.p + Vector2(cos(a), sin(a)) * rad) / p
				draw_rect(Rect2(at.floor() * p, Vector2(p, p)), Color(Color.WHITE.lerp(r.c, k), 1.0 - k))
		for pp in popups: # kept below the question panel (it sits on top of the field)
			var al := clampf(float(pp.life) * 1.6, 0, 1)
			if float(pp.px) > 0:
				var ppx := maxf(2.0, roundf(p * float(pp.px)))
				var c := Vector2(pp.p.x, maxf(pp.p.y, play_top() + ppx * 4.0))
				PixelArt.draw_text(self, str(pp.text), c, ppx, Color(pp.c, al), Color(0, 0, 0, 0.85 * al))
			else:
				var w := minf(size.x - 20, _font.get_string_size(str(pp.text), HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x + 10)
				var at := Vector2(pp.p.x - w * 0.5, maxf(pp.p.y, play_top() + 24.0))
				draw_string_outline(_font, at, str(pp.text), HORIZONTAL_ALIGNMENT_CENTER, w, 18, 6, Color(0, 0, 0, 0.85 * al))
				draw_string(_font, at, str(pp.text), HORIZONTAL_ALIGNMENT_CENTER, w, 18, Color(pp.c, al))
		draw_set_transform(Vector2.ZERO)
		if _flash > 0: # red edge, three steps of pixel bands
			for i in 3:
				var th := (i + 1) * p * 3
				var c := Color(1, 0.25, 0.3, 0.16 * _flash)
				draw_rect(Rect2(0, 0, size.x, th), c)
				draw_rect(Rect2(0, size.y - th, size.x, th), c)
				draw_rect(Rect2(0, 0, th, size.y), c)
				draw_rect(Rect2(size.x - th, 0, th, size.y), c)

	func _draw_city(p: float) -> void:
		var cells := int(ceil(size.x / p)) + 2
		if cells != _city_cells:
			_city_cells = cells
			_city = PixelArt.city(cells)
		var tex: ImageTexture = _city.tex
		var cs := Vector2(tex.get_size()) * p
		var at := Vector2(-p, size.y - cs.y)
		draw_texture_rect(tex, Rect2(at, cs), false)
		var lights: Array = _city.lights
		for i in lights.size():
			if sin(_t * 2.4 + i * 1.9) > 0.2:
				var l: Vector2i = lights[i]
				draw_rect(Rect2(at + Vector2(l) * p, Vector2(p, p)), Color("#ff5f6d"))

	## an answer: the drone carrying a plate with the answer on it (fleeing drones fade out upwards)
	func _draw_drone(sh: Dictionary, p: float) -> void:
		if not bool(sh.alive) and not bool(sh.flee):
			return
		var a := float(sh.a)
		if a <= 0:
			return
		var y := roundf(float(sh.y) + sin(_t * 2.6 + float(sh.col) * 1.7) * 2.0)
		var w := roundf(float(sh.w))
		var col: Color = sh.c
		var tex := PixelArt.drone(int(_t * 4.0 + float(sh.col)) % 2)
		var ds := Vector2(tex.get_size()) * p
		var top := y - PLATE_H * 0.5
		# tow lines from the drone to the plate's corners
		var dl := Vector2(roundf(float(sh.x) - ds.x * 0.5), top - ds.y + p)
		for side in [-1.0, 1.0]:
			var from := Vector2(float(sh.x) + side * ds.x * 0.3, top - p * 2)
			var to := Vector2(float(sh.x) + side * (w * 0.5 - p * 3), top)
			for k in 4:
				var at: Vector2 = from.lerp(to, k / 3.0) / p
				draw_rect(Rect2(at.floor() * p, Vector2(p, p)), Color(col.darkened(0.5), a))
		draw_texture_rect(tex, Rect2(dl, ds), false, Color(col.lightened(0.15), a))
		var r := Rect2(roundf(float(sh.x) - w * 0.5), top, w, PLATE_H)
		_pixel_box(r, Color(col, a), Color(col.darkened(0.6), a), p)
		var ts := _font.get_string_size(str(sh.text), HORIZONTAL_ALIGNMENT_LEFT, -1, 18)
		var inner := w - 6.0 * p
		draw_string(_font, Vector2(float(sh.x) - minf(ts.x, inner) * 0.5, y + 6), str(sh.text), HORIZONTAL_ALIGNMENT_LEFT, inner, 18, Color(0.04, 0.06, 0.13, a))

	## a pixel-art panel: dark edge with notched corners, a lit top row and a shaded bottom row
	func _pixel_box(r: Rect2, fill: Color, edge: Color, p: float) -> void:
		var x := r.position.x
		var y := r.position.y
		var w := r.size.x
		var h := r.size.y
		draw_rect(Rect2(x + p, y, w - p * 2, h), edge)
		draw_rect(Rect2(x, y + p, w, h - p * 2), edge)
		draw_rect(Rect2(x + p * 2, y + p, w - p * 4, h - p * 2), fill)
		draw_rect(Rect2(x + p, y + p * 2, w - p * 2, h - p * 4), fill)
		draw_rect(Rect2(x + p * 2, y + p, w - p * 4, p), Color(fill.lightened(0.4), fill.a))
		draw_rect(Rect2(x + p * 2, y + h - p * 2, w - p * 4, p), Color(fill.darkened(0.2), fill.a))

	## the eagle: banks (narrows) when it turns, flaps now and then (often while turning hard), plasma flame
	## that grows with the streak, a muzzle flash when it fires
	func _draw_eagle(p: float) -> void:
		var flap := (absf(tilt) > 0.35 and fmod(_t, 0.3) < 0.15) or fmod(_t, 1.7) < 0.14
		var tex := PixelArt.eagle(1 if flap else 0)
		var ts := Vector2(tex.get_size()) * p
		var c := Vector2(roundf(px), roundf(ship_y() + sin(_t * 3.2) * 1.5))
		draw_set_transform(_off + c, 0.0, Vector2(1.0 - 0.2 * absf(tilt), 1.0))
		var fl := PixelArt.flame(int(_t * 14.0) % 3)
		var grow := 1.0 + mini(streak, 5) * 0.08
		var fs := Vector2(fl.get_size()) * p * Vector2(1.0, grow)
		draw_texture_rect(fl, Rect2(Vector2(-fs.x * 0.5, ts.y * 0.5 - p * 2), fs), false, Color(1, 0.9, 0.5) if streak >= 5 else Color.WHITE)
		draw_texture_rect(tex, Rect2(-ts * 0.5, ts), false)
		if _muzzle > 0:
			var tip := Vector2(-p * 0.5, -ts.y * 0.5 - p * 2)
			draw_rect(Rect2(tip + Vector2(-p, p), Vector2(p * 3, p)), Color("#fff3b0"))
			draw_rect(Rect2(tip, Vector2(p, p * 3)), Color.WHITE)
		draw_set_transform(_off)
