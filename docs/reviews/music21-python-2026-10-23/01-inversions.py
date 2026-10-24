result = [{"measure": c.measureNumber, "root": c.root().name, "bass": c.bass().name, "quality": c.quality, "inversion": c.inversion()} for c in score.chordify().recurse().getElementsByClass("Chord")]
