import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useLayoutEffect } from "react";

gsap.registerPlugin(ScrollTrigger);

/**
 * Landing-page motion. Everything is visible without script; animations only
 * run when the visitor has not asked for reduced motion.
 * - Lenis smooth scrolling, driven by GSAP's ticker and synced to ScrollTrigger.
 * - One hero settle: [data-hero] items rise 8px and fade in, staggered.
 * - Scroll reveals: [data-reveal] blocks, and [data-stagger] children, once each.
 */
export default function useLandingMotion(scope) {
  useLayoutEffect(() => {
    const root = scope.current;
    if (!root) return undefined;

    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const lenis = new Lenis({ anchors: { offset: -88 }, lerp: 0.12 });
      const tick = (time) => lenis.raf(time * 1000);
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const ctx = gsap.context(() => {
        gsap.from("[data-hero]", {
          y: 8,
          opacity: 0,
          duration: 0.5,
          ease: "power3.out",
          stagger: 0.06,
        });
        gsap.from("[data-hero-visual]", {
          y: 16,
          opacity: 0,
          duration: 0.7,
          delay: 0.12,
          ease: "power3.out",
        });

        gsap.utils.toArray("[data-reveal]").forEach((element) => {
          gsap.from(element, {
            y: 16,
            opacity: 0,
            duration: 0.6,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 85%", once: true },
          });
        });

        gsap.utils.toArray("[data-stagger]").forEach((group) => {
          gsap.from(group.children, {
            y: 12,
            opacity: 0,
            duration: 0.5,
            ease: "power3.out",
            stagger: 0.07,
            scrollTrigger: { trigger: group, start: "top 85%", once: true },
          });
        });
      }, root);

      return () => {
        ctx.revert();
        gsap.ticker.remove(tick);
        lenis.destroy();
      };
    });

    return () => media.revert();
  }, [scope]);
}
