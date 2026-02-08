"use client";

import * as React from "react";
import {
  PlasmicHomepage,
  DefaultHomepageProps
} from "../components/plasmic/blank_project/PlasmicHomepage"; // plasmic-import: e8sLLHz2kmWN/render

export function ClientHomepage(props: DefaultHomepageProps) {
  return <PlasmicHomepage {...props} />;
}
