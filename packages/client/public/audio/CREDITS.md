# Audio credits

## Voice lines (`voice/*.ogg`)

Synthesised with [Piper](https://github.com/rhasspy/piper) (release 2023.11.14-2, MIT licence) from the
text in `packages/client/src/audio/voicelines.json`, using the voice model
**en_US-libritts-high** from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)
(v1.0.0), trained from scratch on the LibriTTS corpus.

- LibriTTS: Heiga Zen, Viet Dang, Rob Clark, Yu Zhang, Ron J. Weiss, Ye Jia, Zhifeng Chen, Yonghui Wu,
  "LibriTTS: A Corpus Derived from LibriSpeech for Text-to-Speech", <http://www.openslr.org/60/>.
  Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The voices are LibriTTS
  speakers (ids in `voicelines.json`). The clips were processed (radio filter, loudness, trimming).

Re-render after editing lines: `python3 tools/voice/generate.py --piper <piper binary> --model <en_US-libritts-high.onnx>`.
