<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    /** Iconify icon name, e.g. `lucide:paw-print`. */
    icon?: string
    chevron?: boolean
    compact?: boolean
    variant?: 'default' | 'primary' | 'danger'
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  {
    subtitle: undefined,
    icon: undefined,
    chevron: false,
    compact: false,
    variant: 'default',
    disabled: false,
    type: 'button',
  },
)

defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    class="plaque-btn"
    :class="[
      `plaque-btn--${variant}`,
      { 'plaque-btn--compact': compact },
    ]"
    :type="type"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <span v-if="icon" class="plaque-btn__badge" aria-hidden="true"><Icon :name="icon" /></span>
    <span class="plaque-btn__text">
      <span class="plaque-btn__title">{{ title }}</span>
      <span v-if="subtitle" class="plaque-btn__subtitle">{{ subtitle }}</span>
    </span>
    <span v-if="chevron" class="plaque-btn__chevron" aria-hidden="true">
      <Icon name="lucide:chevron-right" />
    </span>
  </button>
</template>

<style scoped>
/*
 * The die-cut menu button from the mobile app's main menu: a notched
 * corner, a thick outline that traces the notch, a hexagon icon badge, a
 * two-line label and an optional glossy green "go" chevron. Only used on
 * the landing page and the pre-game waiting room, so its red/maroon look
 * is self-contained here rather than living in the global stylesheet.
 */
.plaque-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  width: 100%;
  min-height: 64px;
  padding: 0.7rem 1.1rem;
  border: none;
  background: linear-gradient(135deg, var(--maroon-1), var(--maroon-2));
  color: var(--text);
  text-align: left;
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%);
  border-radius: var(--radius-plaque) 0 var(--radius-plaque) var(--radius-plaque);
  box-shadow: 0 4px 0 var(--outline), 0 10px 18px rgb(0 0 0 / 45%);
  cursor: pointer;
  transition: transform 0.08s ease, filter 0.15s ease, box-shadow 0.15s ease;
}

.plaque-btn::before {
  content: '';
  position: absolute;
  inset: -3px;
  z-index: -1;
  background: var(--outline);
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%);
  border-radius: inherit;
}

.plaque-btn:hover:not(:disabled) {
  filter: brightness(1.12);
}

.plaque-btn:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--outline), 0 4px 8px rgb(0 0 0 / 40%);
}

.plaque-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.plaque-btn--primary {
  background: linear-gradient(135deg, #ffcf5c, var(--accent) 55%, var(--accent-dim));
}

.plaque-btn--primary .plaque-btn__title,
.plaque-btn--primary .plaque-btn__badge {
  color: #33180a;
}

.plaque-btn--primary .plaque-btn__subtitle {
  color: #6b3a0a;
}

.plaque-btn--danger {
  background: linear-gradient(135deg, #ff7a6a, var(--bad) 55%, #7a1414);
}

.plaque-btn--compact {
  min-height: 52px;
  padding: 0.55rem 0.9rem;
}

.plaque-btn__badge {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  line-height: 1;
  background: var(--red-3);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

.plaque-btn__badge::before {
  content: '';
  position: absolute;
  inset: -3px;
  z-index: -1;
  background: var(--outline);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

.plaque-btn__text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}

.plaque-btn__title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plaque-btn__subtitle {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plaque-btn__chevron {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 35% 30%, #8fe89a, var(--chevron-green) 55%, var(--chevron-green-dark) 100%);
  box-shadow: 0 2px 0 var(--chevron-green-dark), inset 0 1px 0 rgb(255 255 255 / 40%);
  color: #0d2b10;
  font-size: 1.2rem;
  font-weight: 900;
}
</style>
