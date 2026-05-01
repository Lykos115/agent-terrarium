import { useEffect, useState } from "react";

export type RoomLook = "cozy" | "neon" | "forest" | "studio";

export interface RoomCustomization {
  look: RoomLook;
  imageDataUrl?: string;
}

const STORAGE_PREFIX = "agent-terrarium-room:";
export const ROOM_CUSTOMIZATION_CHANGED = "agent-terrarium-room-customization-changed";

const DEFAULT_ROOM: RoomCustomization = { look: "cozy" };

export const ROOM_LOOKS: Record<
  RoomLook,
  {
    label: string;
    wallpaper: string;
    floor: string;
    accent: string;
    glow: string;
  }
> = {
  cozy: {
    label: "Cozy Attic",
    wallpaper: "linear-gradient(180deg, #4a2948 0%, #25182f 100%)",
    floor: "linear-gradient(135deg, #5d3d2e 0%, #2a1d1b 100%)",
    accent: "#ffbd75",
    glow: "rgba(255, 189, 117, 0.28)",
  },
  neon: {
    label: "Neon Lab",
    wallpaper: "radial-gradient(circle at 25% 20%, #3240ff 0%, #11152f 38%, #070816 100%)",
    floor: "linear-gradient(135deg, #0c1634 0%, #1a0730 100%)",
    accent: "#65f6ff",
    glow: "rgba(101, 246, 255, 0.32)",
  },
  forest: {
    label: "Moss Room",
    wallpaper: "linear-gradient(180deg, #315b42 0%, #17271d 100%)",
    floor: "linear-gradient(135deg, #4f3f24 0%, #1c2618 100%)",
    accent: "#a7f070",
    glow: "rgba(167, 240, 112, 0.24)",
  },
  studio: {
    label: "Sunlit Studio",
    wallpaper: "linear-gradient(180deg, #ffe2b7 0%, #cc8b74 100%)",
    floor: "linear-gradient(135deg, #8f583a 0%, #4d2d28 100%)",
    accent: "#fff1c7",
    glow: "rgba(255, 241, 199, 0.35)",
  },
};

export function getRoomCustomization(agentId: string): RoomCustomization {
  if (typeof localStorage === "undefined") return DEFAULT_ROOM;

  const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentId}`);
  if (!raw) return DEFAULT_ROOM;

  try {
    return { ...DEFAULT_ROOM, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_ROOM;
  }
}

export function saveRoomCustomization(
  agentId: string,
  customization: RoomCustomization,
): void {
  localStorage.setItem(
    `${STORAGE_PREFIX}${agentId}`,
    JSON.stringify(customization),
  );
  window.dispatchEvent(
    new CustomEvent(ROOM_CUSTOMIZATION_CHANGED, { detail: { agentId } }),
  );
}

export function useRoomCustomization(agentId: string): [
  RoomCustomization,
  (next: RoomCustomization) => void,
] {
  const [customization, setCustomization] = useState(() =>
    getRoomCustomization(agentId),
  );

  useEffect(() => {
    const refresh = (event?: Event) => {
      const detail = (event as CustomEvent | undefined)?.detail as
        | { agentId?: string }
        | undefined;
      if (!detail?.agentId || detail.agentId === agentId) {
        setCustomization(getRoomCustomization(agentId));
      }
    };

    window.addEventListener("storage", refresh);
    window.addEventListener(ROOM_CUSTOMIZATION_CHANGED, refresh);
    refresh();

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(ROOM_CUSTOMIZATION_CHANGED, refresh);
    };
  }, [agentId]);

  const save = (next: RoomCustomization) => {
    saveRoomCustomization(agentId, next);
    setCustomization(next);
  };

  return [customization, save];
}
