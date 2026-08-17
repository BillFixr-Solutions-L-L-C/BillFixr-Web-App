export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-semibold text-primary-900">{title}</h2>
      <div className="mt-3 space-y-3 text-primary-900/80">{children}</div>
    </section>
  );
}

export function LegalSubheading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 font-semibold text-primary-900">{children}</h3>;
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function LegalJumpNav({ links }: { links: { href: string; label: string }[] }) {
  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-primary-100 bg-white px-5 py-4 text-sm">
      {links.map((link) => (
        <a key={link.href} href={link.href} className="font-medium text-primary-600 hover:text-primary-700">
          {link.label}
        </a>
      ))}
    </nav>
  );
}
