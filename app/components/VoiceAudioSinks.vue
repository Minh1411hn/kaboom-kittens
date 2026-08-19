<template lang="pug">
.voice-sinks(aria-hidden="true")
  audio.voice-sinks__audio(v-for="id in remoteIds" :key="id" :ref="(el) => bind(el, id)" autoplay playsinline)
</template>

<script setup lang="ts">
  import type { ComponentPublicInstance } from "vue"

  /**
   * Invisible: one <audio> element per remote voice member.
   *
   * These have to exist in the DOM even though nothing is drawn — Chrome only
   * feeds WebAudio (our speaking meter) from a PeerConnection stream that is
   * also attached to a media element, and it is the element that applies the
   * per-player mute and the master volume.
   */
  const { remoteIds, streamFor, isMuted, muted, speakerOn, volume, needsGesture } = useVoiceChat()

  const elements = new Map<string, HTMLAudioElement>()

  function bind(el: Element | ComponentPublicInstance | null, id: string) {
    const audio = el as HTMLAudioElement | null
    if (!audio) {
      elements.delete(id)
      return
    }
    elements.set(id, audio)
    const stream = streamFor(id)
    if (stream && audio.srcObject !== stream) audio.srcObject = stream
    apply(audio, id)
    // Autoplay can still be blocked when the tab never received a gesture;
    // the room shows a "bấm để bật tiếng" prompt in that case.
    audio.play().catch(() => {
      needsGesture.value = true
    })
  }

  function apply(audio: HTMLAudioElement, id: string) {
    audio.muted = !speakerOn.value || isMuted(id)
    audio.volume = volume.value
  }

  function applyAll() {
    for (const [id, audio] of elements) apply(audio, id)
  }

  /** Retry every sink after the user finally clicks something. */
  function resume() {
    for (const audio of elements.values()) audio.play().catch(() => undefined)
    needsGesture.value = false
  }

  defineExpose({ resume })

  watch([speakerOn, volume, muted], applyAll, { deep: true })
  watch(remoteIds, () => nextTick(applyAll))
</script>

<style scoped lang="scss">
  .voice-sinks {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
</style>
