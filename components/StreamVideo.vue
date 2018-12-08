<template lang="pug">
.stream-video
  video(ref="video" autoplay)
</template>

<script lang="ts">
import {
  Component,
  Prop,
  Vue
} from "nuxt-property-decorator"
@Component({})
export default class StreamVideo extends Vue {
  @Prop() stream: MediaStream;
  mounted() {
    (this.$refs.video as HTMLVideoElement).srcObject = this.stream;
  }
}
</script>