export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <div className="relative inline-flex flex-col leading-none select-none">
      <span className={`font-display tracking-[0.08em] text-white ${big ? "text-6xl" : "text-3xl"}`}>YUCAN</span>
      <span className={`font-accent font-semibold text-yellow ${big ? "text-xl mt-1" : "text-xs mt-0.5"}`}>Marketing digital</span>
    </div>
  );
}
