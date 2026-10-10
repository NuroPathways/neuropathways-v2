export default function BrandMark({ size = 32, className = "" }) {
  return (
    <img
      src="/neuro-pathways-mark.svg"
      alt=""
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size, flex: "0 0 auto" }}
    />
  );
}
