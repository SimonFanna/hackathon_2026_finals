import Image from "next/image";

/** Official KBC logo from the KDL asset library on kbc.be. Never recoloured or stretched. */
export function KbcLogo({ size = 40 }: { size?: number }) {
  return <Image src="/brand/kbc-logo.svg" alt="KBC" width={size} height={size} unoptimized priority />;
}
