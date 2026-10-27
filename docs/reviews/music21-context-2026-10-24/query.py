chords = []
for c in score.chordify().recurse().getElementsByClass('Chord'):
    chords.append({'m': c.measureNumber, 't': str(c.offset), 'p': [p.nameWithOctave for p in c.pitches], 'b': c.bass().nameWithOctave, 'r': c.root().name, 'q': c.quality, 'i': c.inversion()})
ranges = []
for part in score.parts:
    pitches = [n.pitch for n in part.recurse().notes if n.isNote]
    if pitches:
        ranges.append({'voice': part.id, 'low': min(pitches).nameWithOctave, 'high': max(pitches).nameWithOctave})
result = {'sonorities': chords, 'ranges': ranges}
