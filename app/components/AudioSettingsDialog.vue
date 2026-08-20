<template lang="pug">
.audio-dialog(@click.self="emit('cancel')")
  section.audio-dialog__panel.panel(aria-modal="true" role="dialog")
    h2.audio-dialog__title Cài đặt âm thanh

    p.audio-dialog__error.error(v-if="!supported")
      | Trình duyệt này không hỗ trợ gọi thoại. Hãy dùng Chrome, Edge hoặc Safari bản mới, và truy cập qua HTTPS.
    p.audio-dialog__error.error(v-else-if="!available")
      | Voice chat chưa được cấu hình trên máy chủ này.

    template(v-else)
      .audio-dialog__control
        .audio-dialog__control-head
          span
            Icon(aria-hidden="true" name="lucide:mic")
            |
            | Micro
          button.audio-dialog__toggle(
            :class="{ 'audio-dialog__toggle--on': micOn, on: micOn }"
            type="button"
            @click="setMicOn(!micOn)"
          ) {{ micOn ? "Đang bật" : "Đang tắt" }}

        label.audio-dialog__stack.stack
          span.audio-dialog__sublabel.muted.small Thiết bị thu
          select.audio-dialog__select(:value="micDeviceId ?? ''" @change="setMicDevice($event.target.value || null)")
            option(value="") Mặc định của hệ thống
            option(v-for="device in devices" :key="device.deviceId" :value="device.deviceId") {{ device.label || "Micro không tên" }}

        .audio-dialog__meter(:title="micOn ? 'Mức tín hiệu vào' : 'Micro đang tắt'")
          span.audio-dialog__meter-fill(:style="{ width: `${meter}%` }")
        p.audio-dialog__error.audio-dialog__error--small.error.small(v-if="micError") {{ micError }}

      .audio-dialog__control
        .audio-dialog__control-head
          span
            Icon(aria-hidden="true" name="lucide:volume-2")
            |
            | Loa
          button.audio-dialog__toggle(
            :class="{ 'audio-dialog__toggle--on': speakerOn, on: speakerOn }"
            type="button"
            @click="setSpeakerOn(!speakerOn)"
          ) {{ speakerOn ? "Đang bật" : "Đang tắt" }}

        label.audio-dialog__stack.stack
          span.audio-dialog__sublabel.muted.small Âm lượng
          input.audio-dialog__slider(
            :disabled="!speakerOn"
            :value="volume"
            max="1"
            min="0"
            step="0.05"
            type="range"
            @input="setVolume(Number($event.target.value))"
          )

      p.audio-dialog__hint.muted.small
        | Muốn tắt tiếng riêng một người? Bấm vào biểu tượng loa ở góc ảnh đại diện của họ.
      p.audio-dialog__error.audio-dialog__error--small.error.small(v-if="status === 'error'")
        | Không kết nối được vào phòng thoại. Thử tải lại trang.

    .audio-dialog__actions
      button.audio-dialog__btn.primary(type="button" @click="emit('cancel')") Xong
</template>

<script setup lang="ts">
  /**
   * Mic + speaker controls for the room's voice call. Same backdrop/panel shell
   * as ProfileDialog.vue; all the actual work lives in `useVoiceChat`, which is
   * a singleton, so this dialog can talk to it directly rather than through
   * props and events.
   */
  const emit = defineEmits<{ cancel: [] }>()

  const {
    available,
    status,
    micOn,
    speakerOn,
    volume,
    micDeviceId,
    micError,
    devices,
    localLevel,
    setMicOn,
    setSpeakerOn,
    setVolume,
    setMicDevice,
    refreshDevices
  } = useVoiceChat()

  onMounted(() => void refreshDevices())

  /** 0–1 RMS is a small number in practice; scale it into a usable bar. */
  const meter = computed(() => Math.min(100, Math.round(localLevel.value * 320)))

  const supported = computed(
    () =>
      import.meta.client &&
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof RTCPeerConnection !== "undefined"
  )
</script>

<style scoped lang="scss">
  .audio-dialog {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 21;
    padding: 1rem;

    &__panel {
      max-width: min(420px, 100%);
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.3rem 1.5rem;
    }

    &__title {
      font-size: 1.4rem;
      line-height: 1.15;
      text-align: center;
    }

    &__error {
      &--small {
        font-size: 0.78rem;
      }
    }

    &__control {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      padding: 0.8rem 0.9rem;
      border-radius: var(--radius);
      background: var(--bg-inset);
    }

    &__control-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      font-family: var(--font-display);
    }

    &__toggle {
      padding: 0.25rem 0.7rem;
      border-radius: 999px;
      background: $cream;
      border: 2px solid $ink;
      color: $ink-dim;
      font-size: 0.78rem;
      letter-spacing: 0.3px;

      &--on,
      &.on {
        background: $good;
        color: $cream;
      }
    }

    &__stack {
      // Utilizes global .stack
    }

    &__sublabel {
      font-size: 0.78rem;
    }

    &__select {
      // Select styling
    }

    &__meter {
      height: 8px;
      border-radius: 999px;
      background: $cream;
      border: 2px solid $ink;
      overflow: hidden;
    }

    &__meter-fill {
      display: block;
      height: 100%;
      background: var(--good);
      transition: width 90ms linear;
    }

    &__slider {
      // Range input styling
    }

    &__hint {
      font-size: 0.78rem;
    }

    &__actions {
      display: flex;
      justify-content: center;
    }

    &__btn {
      // Button styling
    }
  }
</style>
