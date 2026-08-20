<template lang="pug">
  .layout
    slot
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
  /*
   * The single source of the app's ground colour. `body` paints the same
   * cream (main.css) so overscroll never flashes white behind this element.
   */
  .layout {
    min-height: 100%;
    background: $cream;
  }
</style>
