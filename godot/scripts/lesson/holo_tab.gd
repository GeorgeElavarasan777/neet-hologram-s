class_name HoloTab
extends Control
## Hologram: the NCERT figures of this chapter, each opening in the 3-D Hologram viewer.

var lesson: LessonScreen


func _init(l: LessonScreen) -> void:
	lesson = l


func _ready() -> void:
	var col := UI.vbox(12)
	col.name = "Holograms"
	var s := UI.scroller(UI.pad(col, 16, 16, 16, 28), 760)
	s.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(s)
	var color := lesson.subject_color()
	var holos: Array = lesson.info.get("chapter", {}).get("holograms", []) if not lesson.info.is_empty() else []
	if holos.is_empty():
		var c := UI.card(18, UI.CARD, 16)
		UI.box(c).add_child(UI.badge("holo", color, 44))
		UI.box(c).add_child(UI.label("No NCERT hologram for this chapter yet", 17, UI.TEXT, UI.f_bold, true))
		UI.box(c).add_child(UI.label("The Hologram Room has 124 diagrams from the other chapters — every one can be turned, zoomed, taken apart and quizzed.", 14, UI.TEXT2, null, true))
		var go := UI.btn("Open the Hologram Room", "soft", "holo", color)
		go.pressed.connect(func() -> void: App.push(HoloRoomScreen.new()))
		UI.box(c).add_child(go)
		col.add_child(c)
		return
	col.add_child(UI.label("%s of this chapter in 3-D. Drag to turn, pinch or scroll to zoom, tap a label to read about it." % UI.plural(holos.size(), "figure"), 14, UI.TEXT2, null, true))
	await App.load_holo_index()
	for h in holos:
		var f: Dictionary = App.holo_by_id.get(h.hash, {})
		var tc := TapCard.new(14, UI.CARD, 16)
		tc.name = "Holo_" + str(h.hash)
		var row := UI.hbox(12)
		row.add_child(UI.badge("holo", color, 44))
		var t := UI.vbox(2)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.add_child(UI.label(str(h.title), 16, UI.TEXT, UI.f_bold, true))
		var meta := str(h.get("fig", ""))
		if not f.is_empty():
			meta += " · %s · %s" % [UI.plural(f.variants.size(), "view"), UI.plural(f.variants[0].labels.size(), "label")]
		t.add_child(UI.label(meta, 12, UI.MUTED))
		row.add_child(t)
		row.add_child(UI.icon_rect("chev", 18, UI.MUTED))
		UI.box(tc).add_child(row)
		tc.tapped.connect(func() -> void: App.push(HoloScreen.new(h.hash, 0)))
		col.add_child(tc)
