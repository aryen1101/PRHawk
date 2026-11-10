import { Link } from "react-router-dom";

export default function Brand({ size = 32 }) {
  return (
    <Link to="/" className="brand" aria-label="PRHawk home">
      <img src="/prhawk-mark.png" width={size} height={size} alt="" />
      <span className="wordmark" aria-hidden="true">
        PR<span>Hawk</span>
      </span>
    </Link>
  );
}
