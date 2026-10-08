class_name PracticeBank
extends RefCounted
## Questions from content/practice.json (every one generated and checked by engines/practice/bank.js):
## pick from the chosen chapters, then trim the options to the number wanted (the answer always stays).

static func chapters() -> Array:
	return App.practice_data.get("chapters", [])


static func groups() -> Array:
	return App.practice_data.get("groups", [])


static func chapter(id: String) -> Dictionary:
	for c in chapters():
		if c.id == id:
			return c
	return {}


## one question as {q, options, answer, hint, topic, chapter, color}
static func make(ids: Array, count := 4, avoid := {}) -> Dictionary:
	var pool: Array = []
	for c in chapters():
		if ids.is_empty() or c.id in ids:
			pool.append(c)
	if pool.is_empty():
		pool = chapters()
	for tries in 12:
		var c: Dictionary = pool.pick_random()
		var gens: Array = c.gens.filter(func(g): return not g.is_empty())
		if gens.is_empty():
			continue
		var g: Array = gens.pick_random()
		var item: Dictionary = g.pick_random()
		if avoid.has(item.q) and tries < 10:
			continue
		var right: String = item.o[int(item.a)]
		var wrong: Array = []
		for i in item.o.size():
			if i != int(item.a):
				wrong.append(item.o[i])
		wrong.shuffle()
		var opts: Array = [right] + wrong.slice(0, maxi(1, count - 1))
		opts.shuffle()
		return {"q": item.q, "options": opts, "answer": opts.find(right), "hint": item.get("h", ""), "topic": item.get("t", ""), "chapter": c.id, "chapter_title": c.title, "color": c.get("color", "#4fd1e8")}
	return {}


## a hint that helps without giving the answer away
static func safe_hint(q: Dictionary) -> String:
	var h := str(q.get("hint", ""))
	var ans := str(q.options[q.answer])
	if h == "":
		return "Work it out step by step from the question."
	if ans.length() >= 1 and h.contains(ans):
		var cut := h.find(ans)
		h = h.substr(0, cut).strip_edges()
		h = h.trim_suffix("=").trim_suffix("→").strip_edges()
		if h.length() < 6:
			return "Write down what is given, then apply the formula for this topic."
		return h + " …"
	return h
