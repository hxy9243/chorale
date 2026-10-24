upper = list(score.parts[0].recurse().notes)
lower = list(score.parts[1].recurse().notes)
result = [{"fromMeasure": upper[i].measureNumber, "toMeasure": upper[i+1].measureNumber, "parallelFifth": music21.voiceLeading.VoiceLeadingQuartet(upper[i], upper[i+1], lower[i], lower[i+1]).parallelFifth()} for i in range(len(upper)-1)]
