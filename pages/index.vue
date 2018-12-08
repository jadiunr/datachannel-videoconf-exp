<template lang="pug">
section
  h1.header Nuxt TypeScript Starter
  .cards
    card(v-for="person in people" :key="person.id" :person="person")
</template>

<script lang="ts">
import {
  Component,
  Vue
} from "nuxt-property-decorator"
import { State } from "vuex-class"
import Card from "~/components/Card.vue"

@Component({
  components: {
    Card
  }
})
export default class extends Vue {
  @State people
}
</script>

<style scoped lang="sass">
.header
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif

.cards
  display: flex
  flex-wrap: wrap
</style>