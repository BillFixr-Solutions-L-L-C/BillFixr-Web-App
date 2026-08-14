export default function LetterPreview() {
  return (
    <div className="aspect-[3/4] w-full space-y-1.5 rounded-lg border border-gray-100 bg-white p-4 text-[6px] leading-tight text-gray-400">
      <p className="text-right">
        Dave J. Collins
        <br />
        Crown Med Hospital Center
        <br />
        July 14, 2026
      </p>
      <p className="pt-2">The Billing Manager,</p>
      <p>
        I am writing regarding the itemized bill from Crown Med Hospital Center dated July 14,
        2026. Our review identified 2 billing discrepancies, resulting in an overcharge of
        $5,590. We request a corrected statement reflecting an adjusted balance of $2,500.
      </p>
      <p>We look forward to your response.</p>
      <p className="pt-2">
        Yours faithfully,
        <br />
        Dave J. Collins
      </p>
    </div>
  );
}
