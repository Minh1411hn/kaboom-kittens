<script setup lang="ts">
/**
 * Change nickname + avatar. Same backdrop/panel shell as ConfirmDialog.vue;
 * the caller owns the actual network calls (REST session write, then the WS
 * `update-profile` broadcast) and closes the dialog once `save` resolves —
 * `saving` is driven by the caller too, since `emit` is fire-and-forget and
 * cannot itself be awaited to know when that round trip finishes.
 */
const props = withDefaults(
    defineProps<{ nickname: string; avatarId: string; saving?: boolean }>(),
    { saving: false },
);
const emit = defineEmits<{
    save: [nickname: string, avatarId: string];
    cancel: [];
}>();

const nicknameValue = ref(props.nickname);
const avatarIdValue = ref(props.avatarId);
const error = ref("");

const avatarIds = allAvatarIds();

function save() {
    if (props.saving) return;
    const trimmed = nicknameValue.value.trim();
    if (trimmed.length < 2) {
        error.value = "Biệt danh phải có ít nhất 2 ký tự.";
        return;
    }
    if (trimmed.length > 16) {
        error.value = "Biệt danh tối đa 16 ký tự.";
        return;
    }
    error.value = "";
    emit("save", trimmed, avatarIdValue.value);
}
</script>

<template>
    <div class="backdrop" @click.self="emit('cancel')">
        <section class="dialog panel" role="dialog" aria-modal="true">
            <h2>Chỉnh sửa hồ sơ</h2>

            <label class="stack">
                <span class="muted">Biệt danh</span>
                <input
                    v-model="nicknameValue"
                    maxlength="16"
                    autocomplete="nickname"
                    placeholder="Hoàng Thượng"
                    autofocus
                />
            </label>

            <p v-if="error" class="error">{{ error }}</p>

            <div class="stack">
                <span class="muted">Ảnh đại diện</span>
                <div class="avatar-grid">
                    <button
                        v-for="id in avatarIds"
                        :key="id"
                        type="button"
                        class="avatar-choice"
                        :class="{ selected: avatarIdValue === id }"
                        @click="avatarIdValue = id"
                    >
                        <img :src="avatarUrl(id)" alt="" />
                    </button>
                </div>
            </div>

            <div class="actions">
                <button @click="emit('cancel')">Hủy</button>
                <PlaqueButton
                    type="button"
                    :title="saving ? 'Đang lưu…' : 'Lưu'"
                    icon="💾"
                    variant="primary"
                    compact
                    :disabled="saving"
                    @click="save"
                />
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
    max-width: min(440px, 100%);
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

.avatar-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
    gap: 0.5rem;
    max-height: 260px;
    overflow-y: auto;
    padding: 0.15rem;
}

.avatar-choice {
    padding: 0;
    border: 3px solid transparent;
    border-radius: 50%;
    background: none;
    box-shadow: none;
    cursor: pointer;
    line-height: 0;
}

.avatar-choice:hover:not(:disabled) {
    filter: brightness(1.1);
}

.avatar-choice img {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    object-fit: cover;
    display: block;
}

.avatar-choice.selected {
    border-color: var(--warn);
}

.actions {
    display: flex;
    gap: 0.6rem;
    justify-content: center;
}

.actions > button:first-child {
    flex: none;
}

.actions :deep(.plaque-btn) {
    width: auto;
}
</style>
