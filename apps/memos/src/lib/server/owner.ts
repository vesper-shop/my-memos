export interface Owner {
  name: string;
  email: string;
  image: string | null;
  href: string;
}

export const profileOf = (handle: string, name: string, image: string | null): Owner => ({
  name,
  email: `@${handle}`,
  image,
  href: `https://${handle}.noted-this.date/`,
});
