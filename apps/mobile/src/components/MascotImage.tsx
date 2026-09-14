import Image, { type ImageProps } from "next/image";

type MascotImageProps = Omit<ImageProps, "src" | "alt"> & {
  src: string;
  darkSrc: string;
  alt: string;
};

/**
 * Renders the artwork variant that matches the app's explicit theme. A
 * picture/media query cannot follow `[data-theme]`, so both local assets are
 * kept in the markup and CSS swaps them without changing layout dimensions.
 */
export default function MascotImage({ src, darkSrc, alt, className, ...props }: MascotImageProps) {
  const sharedClassName = ["theme-mascot-light", className].filter(Boolean).join(" ");
  const darkClassName = ["theme-mascot-dark", className].filter(Boolean).join(" ");

  return (
    <>
      <Image {...props} src={src} alt={alt} className={sharedClassName} />
      <Image {...props} src={darkSrc} alt="" aria-hidden="true" className={darkClassName} />
    </>
  );
}
