extends Node
## Speech (autoload): reads text aloud with the device's voices (DisplayServer TTS — the Web Speech API in
## browsers), picks a natural-sounding voice, and reports the word being spoken so it can be highlighted.
## Voices that never report word boundaries (many online voices) get an estimated position from the
## speaking time. With no speech engine (or in tests) the "reading" is simulated at speaking pace, so
## Listen still steps through the notes.

signal word_at(char_pos: int) # position in the text being spoken
signal done(completed: bool) # completed = reached the end (false: stopped or failed)

var supported := false
var simulate := false
var voices: Array = [] # [{name, id, language}] best first
var _id := 0
var _text := ""
var _started := 0
var _boundary := false
var _active := false
var _paused := false
var _paused_at := 0
var _paused_total := 0
var _sim_pos := 0


func _ready() -> void:
	supported = DisplayServer.has_feature(DisplayServer.FEATURE_TEXT_TO_SPEECH) and ProjectSettings.get_setting("audio/general/text_to_speech", false)
	if App.autotest:
		supported = false
	simulate = not supported
	if supported:
		DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_STARTED, _on_started)
		DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_ENDED, _on_ended)
		DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_CANCELED, _on_canceled)
		DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_BOUNDARY, _on_boundary)
		refresh_voices()
		# browsers deliver their voice list a moment after start-up
		for i in 6:
			await get_tree().create_timer(0.5 + i * 0.5).timeout
			if voices.is_empty():
				refresh_voices()


## natural voices first: online/neural/enhanced voices, then the student's language (Indian English first)
func refresh_voices() -> void:
	if not supported:
		return
	var list: Array = []
	for v in DisplayServer.tts_get_voices():
		var lang := str(v.get("language", "")).to_lower()
		if lang.begins_with("en") or lang.begins_with("hi"):
			list.append(v)
	list.sort_custom(func(a, b): return _rank(a) > _rank(b))
	voices = list


func _rank(v: Dictionary) -> float:
	var n := str(v.get("name", "")).to_lower()
	var lang := str(v.get("language", "")).to_lower().replace("_", "-")
	var r := 0.0
	for k in ["natural", "neural", "online", "premium", "enhanced", "wavenet", "studio"]:
		if k in n:
			r += 40
	if "google" in n:
		r += 20
	if "network" in n:
		r += 25
	if lang.begins_with("en-in"):
		r += 12
	elif lang.begins_with("en-gb"):
		r += 8
	elif lang.begins_with("en-us"):
		r += 7
	elif lang.begins_with("hi"):
		r -= 30
	if "compact" in n or "espeak" in n:
		r -= 40
	return r


func voice_id() -> String:
	var want := str(App.setting("voice", ""))
	for v in voices:
		if v.id == want:
			return want
	return voices[0].id if not voices.is_empty() else ""


func voice_label(v: Dictionary) -> String:
	var n := str(v.get("name", "Voice"))
	return n.replace("Microsoft ", "").replace(" - English", " ·").replace("Google ", "Google · ")


func is_active() -> bool:
	return _active


func is_paused() -> bool:
	return _paused


## speak one piece of text; emits word_at while speaking and done at the end
func speak(text: String) -> void:
	stop(false)
	_text = text
	_id += 1
	_active = true
	_paused = false
	_paused_total = 0
	_boundary = false
	_started = Time.get_ticks_msec()
	_sim_pos = 0
	if simulate or voices.is_empty():
		simulate = true
		return
	var rate := float(App.setting("rate", 1.0))
	DisplayServer.tts_speak(text, voice_id(), 100, 1.0, rate, _id, true)


func stop(emit := true) -> void:
	var was := _active
	_active = false
	_paused = false
	if supported and not simulate:
		DisplayServer.tts_stop()
	if was and emit:
		done.emit(false)


func pause() -> void:
	if not _active or _paused:
		return
	_paused = true
	_paused_at = Time.get_ticks_msec()
	if supported and not simulate:
		DisplayServer.tts_pause()


func resume() -> void:
	if not _paused:
		return
	_paused = false
	_paused_total += Time.get_ticks_msec() - _paused_at
	if supported and not simulate:
		DisplayServer.tts_resume()


# ───────── engine callbacks ─────────

func _on_started(id: int) -> void:
	if id == _id:
		_started = Time.get_ticks_msec()


func _on_ended(id: int) -> void:
	if id == _id and _active:
		_active = false
		done.emit(true)


func _on_canceled(id: int) -> void:
	if id == _id and _active:
		_active = false
		done.emit(false)


func _on_boundary(pos: int, id: int) -> void:
	if id == _id and _active:
		_boundary = true
		word_at.emit(pos)


# ───────── estimated word position (voices without boundaries) and the simulated voice ─────────

func _process(_dt: float) -> void:
	if not _active or _paused:
		return
	var elapsed := (Time.get_ticks_msec() - _started - _paused_total) / 1000.0
	var cps := 14.5 * float(App.setting("rate", 1.0)) # ≈ 160 words a minute
	var pos := int(elapsed * cps)
	if simulate:
		if App.autotest:
			pos = int(elapsed * cps * 6.0) # tests: quick
		if pos >= _text.length():
			_active = false
			done.emit(true)
			return
		if pos != _sim_pos:
			_sim_pos = pos
			word_at.emit(pos)
	elif not _boundary and elapsed > 0.7:
		word_at.emit(mini(pos, _text.length() - 1))
