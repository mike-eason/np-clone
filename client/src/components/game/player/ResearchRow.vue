<template>
  <tr v-if="playerResearchLevel">
    <td class="row-icon"><i class="fas" :class="iconClass"></i></td>
    <td>{{ title }}</td>
    <td class="text-right" :class="playerStyle">
      {{ playerResearchLevel }}
    </td>
    <td
      v-if="userPlayer && player != userPlayer"
      class="text-right"
      :class="userPlayerStyle"
    >
      {{ userPlayerResearchLevel }}
    </td>
  </tr>
</template>
<script>
import gameHelper from "../../../services/gameHelper";

export default {
  props: {
    player: Object,
    userPlayer: Object,
    research: String,
    title: String,
    iconClass: String,
  },
  computed: {
    playerResearchLevel () {
      let tech = this.player.research[this.research]

      if (tech == null) {
        return null
      } else {
        return tech.level;
      }
    },
    userPlayerResearchLevel () {
      return this.userPlayer.research[this.research].level
    },
    playerStyle () {
      if ((this.userPlayer && this.userPlayer == this.player) || !this.userPlayer) {
        return {
          "text-success": this.hasHighestTechLevel,
          "text-danger": this.hasLowestTechLevel,
        };
      } else {
        return {};
      }
    },
    userPlayerStyle () {
      if (this.userPlayer) {
        return {
          "text-success":
            this.playerResearchLevel < this.userPlayerResearchLevel,
          "text-danger":
            this.playerResearchLevel > this.userPlayerResearchLevel,
        };
      } else {
        return {};
      }
    },
    hasHighestTechLevel () {
      return gameHelper.playerHasHighestTechLevel(
        this.$store.state.game,
        this.research,
        this.player
      );
    },
    hasLowestTechLevel () {
      return gameHelper.playerHasLowestTechLevel(
        this.$store.state.game,
        this.research,
        this.player
      );
    }
  }
};
</script>
<style scoped>
</style>