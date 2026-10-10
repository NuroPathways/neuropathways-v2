import React from "react";
import Svg, { Defs, LinearGradient, Path, Polygon, Stop } from "react-native-svg";

type IconProps = {
  name: string;
  size?: number;
  color?: string;
  style?: object;
  testID?: string;
  accessibilityLabel?: string;
};

function NeuroMark({ name: _name, size = 24, style, testID, accessibilityLabel }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      style={style}
      testID={testID}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
    >
      <Defs>
        <LinearGradient id="neuropathways-mark-gradient" x1="7" y1="8" x2="40" y2="40">
          <Stop offset="0" stopColor="#48D187" />
          <Stop offset=".48" stopColor="#13B7B3" />
          <Stop offset="1" stopColor="#1765C5" />
        </LinearGradient>
      </Defs>
      <Path
        fill="url(#neuropathways-mark-gradient)"
        d="M23.2 3.5c-9.1 0-15.7 6.4-15.7 15.1 0 4.8 2.5 8.1 4.5 11.2 1.3 2 1.7 4.1.8 6.3l-2 5.6h13.6c4.8 0 7.1-2.7 6.2-6.2l-.7-2.7c2.1-2.9 4.7-4.3 8.1-4.7 1.7-.2 2.8-1.4 2.8-2.9 0-1.2-.8-2.1-2-2.5.8-1.5.6-2.7-.4-3.7-1.2-1.1-2.2-2-2.5-3.6C34.7 7.9 30.1 3.5 23.2 3.5Z"
      />
      <Path
        d="M30.6 11.8c-.2 4.3-4 6-11.2 8.2-6.2 1.9-6.3 5.3-.4 7.8 5.1 2.1 7 5 3.8 9.2"
        stroke="white"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <Polygon points="29,5.9 30.3,9.2 33.8,9.5 31.1,11.7 32,15.1 29,13.2 26,15.1 26.9,11.7 24.2,9.5 27.7,9.2" fill="white" />
    </Svg>
  );
}

export const Feather = Object.assign(NeuroMark, {
  glyphMap: {} as Record<string, number>,
});

