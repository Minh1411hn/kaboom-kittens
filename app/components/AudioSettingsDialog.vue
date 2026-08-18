<script setup lang="ts">
/**
 * Mic + speaker controls for the room's voice call. Same backdrop/panel shell
 * as ProfileDialog.vue; all the actual work lives in `useVoiceChat`, which is
 * a singleton, so this dialog can talk to it directly rather than through
 * props and events.
 */
const emit = defineEmits<{ cancel: [] }>();

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
    refreshDevices,
} = useVoiceChat();

onMounted(() => void refreshDevices());

/** 0–1 RMS is a small number in practice; scale it into a usable bar. */
const meter = computed(() =>
    Math.min(100, Math.round(localLevel.value * 320)),
);

const supported = computed(
    () =>
        import.meta.client &&
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        typeof RTCPeerConnection !== "undefined",
);
</script>

<template>
    <div class="backdrop" @click.self="emit('cancel')">
        <section class="dialog panel" role="dialog" aria-modal="true">
            <h2>Cài đặt âm thanh</h2>

            <p v-if="!supported" class="error">
                Trình duyệt này không hỗ trợ gọi thoại. Hãy dùng Chrome, Edge
                hoặc Safari bản mới, và truy cập qua HTTPS.
            </p>
            <p v-else-if="!available" class="error">
                Voice chat chưa được cấu hình trên máy chủ này.
            </p>

            <template v-else>
                <div class="control">
                    <div class="control-head">
                        <span><Icon name="lucide:mic" aria-hidden="true" /> Micro</span>
                        <button
                            class="toggle"
                            :class="{ on: micOn }"
                            type="button"
                            @click="setMicOn(!micOn)"
                        >
                            {{ micOn ? "Đang bật" : "Đang tắt" }}
                        </button>
                    </div>

                    <label class="stack">
                        <span class="muted small">Thiết bị thu</span>
                        <select
                            :value="micDeviceId ?? ''"
                            @change="
                                setMicDevice(
                                    ($event.target as HTMLSelectElement)
                                        .value || null,
                                )
                            "
                        >
                            <option value="">Mặc định của hệ thống</option>
                            <option
                                v-for="device in devices"
                                :key="device.deviceId"
                                :value="device.deviceId"
                            >
                                {{ device.label || "Micro không tên" }}
                            </option>
                        </select>
                    </label>

                    <div
                        class="meter"
                        :title="micOn ? 'Mức tín hiệu vào' : 'Micro đang tắt'"
                    >
                        <span class="meter-fill" :style="{ width: `${meter}%` }" />
                    </div>
                    <p v-if="micError" class="error small">{{ micError }}</p>
                </div>

                <div class="control">
                    <div class="control-head">
                        <span><Icon name="lucide:volume-2" aria-hidden="true" /> Loa</span>
                        <button
                            class="toggle"
                            :class="{ on: speakerOn }"
                            type="button"
                            @click="setSpeakerOn(!speakerOn)"
                        >
                            {{ speakerOn ? "Đang bật" : "Đang tắt" }}
                        </button>
                    </div>

                    <label class="stack">
                        <span class="muted small">Âm lượng</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            :value="volume"
                            :disabled="!speakerOn"
                            @input="
                                setVolume(
                                    Number(
                                        ($event.target as HTMLInputElement)
                                            .value,
                                    ),
                                )
                            "
                        />
                    </label>
                </div>

                <p class="muted small">
                    Muốn tắt tiếng riêng một người? Bấm vào biểu tượng loa ở góc
                    ảnh đại diện của họ.
                </p>
                <p v-if="status === 'error'" class="error small">
                    Không kết nối được vào phòng thoại. Thử tải lại trang.
                </p>
            </template>

            <div class="actions">
                <button class="primary" type="button" @click="emit('cancel')">
                    Xong
                </button>
            </div>
        </section>
    </div>
</template>

<style scoped>
.backdrop {
    position: fixed;
    inset: 0;
    background: rgb(20 8 0 / 68%);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    z-index: 21;
    padding: 1rem;
}

.dialog {
    max-width: min(420px, 100%);
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.3rem 1.5rem;
}

.dialog h2 {
    font-size: 1.4rem;
    line-height: 1.15;
    text-align: center;
}

.control {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius);
    background: var(--bg-inset);
}

.control-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    font-family: var(--font-display);
}

.toggle {
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 30%);
    color: var(--text-dim);
    font-size: 0.78rem;
    letter-spacing: 0.3px;
}

.toggle.on {
    background: var(--good);
    color: #10240f;
}

.meter {
    height: 8px;
    border-radius: 999px;
    background: rgb(0 0 0 / 35%);
    overflow: hidden;
}

.meter-fill {
    display: block;
    height: 100%;
    background: var(--good);
    transition: width 90ms linear;
}

.small {
    font-size: 0.78rem;
}

.actions {
    display: flex;
    justify-content: center;
}
</style>
