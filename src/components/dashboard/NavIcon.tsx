export default function NavIcon({ active = false }: { active?: boolean }) {
  const color = active ? "#0F7545" : "#4D6276";

  return (
    <span className="relative block h-[18px] w-[18px] shrink-0">
      <svg
        className="absolute"
        style={{ top: "19.14%", left: "3.13%", right: "3.14%", bottom: "3.14%", width: "auto", height: "auto" }}
        viewBox="0 0 17.9978 15.1152"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M9.75 14.2962C11.6345 12.7007 13.9421 11.6871 16.392 11.3787C16.6807 11.3407 16.9457 11.199 17.1377 10.98C17.3296 10.761 17.4354 10.4797 17.4352 10.1885V1.77424C17.4357 1.60108 17.399 1.42984 17.3276 1.27211C17.2561 1.11439 17.1516 0.973866 17.0211 0.860067C16.8905 0.746269 16.7371 0.661852 16.5711 0.612537C16.4051 0.563222 16.2305 0.55016 16.059 0.574238C13.7317 0.93365 11.5486 1.92813 9.75 3.44824C9.5348 3.61524 9.27015 3.70588 8.99775 3.70588C8.72535 3.70588 8.4607 3.61524 8.2455 3.44824C6.44729 1.92931 4.26506 0.935647 1.93875 0.576487C1.76746 0.552437 1.59301 0.565444 1.42718 0.614628C1.26135 0.663812 1.10802 0.748027 0.977541 0.86158C0.847066 0.975133 0.742492 1.11538 0.670889 1.27283C0.599286 1.43028 0.562324 1.60127 0.562501 1.77424V10.1885C0.562372 10.4797 0.668135 10.761 0.860078 10.98C1.05202 11.199 1.31704 11.3407 1.60575 11.3787C4.05646 11.6867 6.36484 12.7003 8.25 14.2962C8.46466 14.4625 8.72848 14.5527 9 14.5527C9.27152 14.5527 9.53534 14.4625 9.75 14.2962V14.2962Z"
          stroke={color}
          strokeWidth="1.125"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        className="absolute"
        style={{ top: "3.13%", left: "16.6%", right: "16.58%", bottom: "80.59%", width: "auto", height: "auto" }}
        viewBox="0 0 13.1523 4.05653"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M12.5896 0.562633C10.656 1.04679 8.85634 1.9607 7.32463 3.23638C7.10943 3.40338 6.84478 3.49403 6.57238 3.49403C6.29999 3.49403 6.03533 3.40338 5.82013 3.23638C4.2907 1.96173 2.49369 1.0481 0.562633 0.563383"
          stroke={color}
          strokeWidth="1.125"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: "36.6%", bottom: "3.14%", width: "1.125px", height: "auto" }}
        viewBox="0 0 1.125 11.9722"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0.5625 0.5625V11.4097" stroke={color} strokeWidth="1.125" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
