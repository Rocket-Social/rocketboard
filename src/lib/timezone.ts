type CuratedTimezoneMetadata = {
  aliases?: string[];
  city?: string;
  countryCode?: string;
  label?: string;
  rank?: number;
};

export type TimezoneOption = {
  label: string;
  offsetLabel: string;
  previewLabel: string | null;
  rank: number;
  searchText: string;
  searchTokens: string[];
  secondaryLabel: string;
  value: string;
};

export type TimezoneSearchResult = {
  ambiguityHint: string | null;
  options: TimezoneOption[];
};

const fallbackTimezones = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

const preferredTimezoneAliases: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Etc/UTC": "UTC",
  "US/Central": "America/Chicago",
  "US/Eastern": "America/New_York",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  Zulu: "UTC",
};

const commonSuggestionTimezones = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

const ambiguousTimezoneAbbreviationHints: Record<string, string> = {
  cst: "CST can mean Central, China, or Cuba Standard Time. Pick the city you want.",
  ist: "IST can mean India, Ireland, or Israel Standard Time. Pick the city you want.",
};

const fallbackCountryNames: Record<string, string> = {
  AE: "United Arab Emirates",
  AU: "Australia",
  CN: "China",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  GB: "United Kingdom",
  HK: "Hong Kong",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  JP: "Japan",
  NZ: "New Zealand",
  SG: "Singapore",
  US: "United States",
};

const curatedTimezoneMetadata: Record<string, CuratedTimezoneMetadata> = {
  UTC: {
    aliases: ["coordinated universal time", "gmt", "universal", "utc", "zulu"],
    label: "UTC",
    rank: 1000,
  },
  "America/Chicago": {
    aliases: [
      "cdt",
      "central",
      "central time",
      "chicago",
      "cst",
      "dallas",
      "houston",
    ],
    city: "Chicago",
    countryCode: "US",
    rank: 950,
  },
  "America/Denver": {
    aliases: ["denver", "mdt", "mountain", "mountain time", "mst"],
    city: "Denver",
    countryCode: "US",
    rank: 900,
  },
  "America/Los_Angeles": {
    aliases: [
      "la",
      "los angeles",
      "pacific",
      "pacific time",
      "pdt",
      "pst",
      "san francisco",
      "seattle",
    ],
    city: "Los Angeles",
    countryCode: "US",
    rank: 980,
  },
  "America/New_York": {
    aliases: [
      "boston",
      "east coast",
      "eastern",
      "eastern time",
      "edt",
      "est",
      "miami",
      "new york",
      "nyc",
      "toronto",
    ],
    city: "New York",
    countryCode: "US",
    rank: 990,
  },
  "America/Phoenix": {
    aliases: ["arizona", "phoenix"],
    city: "Phoenix",
    countryCode: "US",
    rank: 760,
  },
  "Asia/Dubai": {
    aliases: ["dubai", "gst", "uae"],
    city: "Dubai",
    countryCode: "AE",
    rank: 760,
  },
  "Asia/Hong_Kong": {
    aliases: ["hkt", "hong kong"],
    city: "Hong Kong",
    countryCode: "HK",
    rank: 820,
  },
  "Asia/Jerusalem": {
    aliases: ["israel", "israel standard time", "ist", "jerusalem", "tel aviv"],
    city: "Jerusalem",
    countryCode: "IL",
    rank: 730,
  },
  "Asia/Kolkata": {
    aliases: [
      "bangalore",
      "bengaluru",
      "bombay",
      "calcutta",
      "delhi",
      "india",
      "india standard time",
      "indian",
      "ist",
      "kolkata",
      "mumbai",
      "new delhi",
    ],
    city: "Kolkata",
    countryCode: "IN",
    rank: 970,
  },
  "Asia/Shanghai": {
    aliases: ["beijing", "china", "china standard time", "cst", "shanghai"],
    city: "Shanghai",
    countryCode: "CN",
    rank: 870,
  },
  "Asia/Singapore": {
    aliases: ["sgt", "singapore"],
    city: "Singapore",
    countryCode: "SG",
    rank: 840,
  },
  "Asia/Tokyo": {
    aliases: ["japan", "jst", "tokyo"],
    city: "Tokyo",
    countryCode: "JP",
    rank: 890,
  },
  "Australia/Sydney": {
    aliases: ["aedt", "aest", "australia", "sydney"],
    city: "Sydney",
    countryCode: "AU",
    rank: 820,
  },
  "Europe/Berlin": {
    aliases: [
      "berlin",
      "central european",
      "central european time",
      "cest",
      "cet",
      "germany",
    ],
    city: "Berlin",
    countryCode: "DE",
    rank: 910,
  },
  "Europe/Dublin": {
    aliases: ["dublin", "gmt", "ireland", "irish standard time", "ist"],
    city: "Dublin",
    countryCode: "IE",
    rank: 720,
  },
  "Europe/London": {
    aliases: ["britain", "bst", "gmt", "london", "uk", "united kingdom"],
    city: "London",
    countryCode: "GB",
    rank: 920,
  },
  "Europe/Madrid": {
    aliases: ["cest", "cet", "madrid", "spain"],
    city: "Madrid",
    countryCode: "ES",
    rank: 850,
  },
  "Europe/Paris": {
    aliases: ["cest", "cet", "france", "paris"],
    city: "Paris",
    countryCode: "FR",
    rank: 860,
  },
  "Pacific/Auckland": {
    aliases: ["auckland", "new zealand", "nzdt", "nzst"],
    city: "Auckland",
    countryCode: "NZ",
    rank: 810,
  },
};

let supportedTimezones: string[] | null = null;
const timezoneOptionsCache = new Map<string, TimezoneOption[]>();

const preferredTimezoneReverseAliases = Object.entries(
  preferredTimezoneAliases,
).reduce<Record<string, string[]>>((aliases, [legacyValue, preferredValue]) => {
  const nextAliases = aliases[preferredValue] ?? [];
  nextAliases.push(legacyValue);
  aliases[preferredValue] = nextAliases;
  return aliases;
}, {});

function getLocaleList(locale?: string) {
  const locales = [
    locale,
    typeof navigator !== "undefined" ? navigator.language : null,
    "en",
  ];

  return locales.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
  );
}

function canFormatTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function getPreferredTimezoneAlias(value: string) {
  return preferredTimezoneAliases[value] ?? value;
}

function getCountryLabel(countryCode: string, locale?: string) {
  try {
    return (
      new Intl.DisplayNames(getLocaleList(locale), { type: "region" }).of(
        countryCode,
      ) ??
      fallbackCountryNames[countryCode] ??
      null
    );
  } catch {
    return fallbackCountryNames[countryCode] ?? null;
  }
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[_/().,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function prettifyTimezoneSegment(segment: string) {
  return segment
    .replace(/_/g, " ")
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getFallbackTimezoneLabel(value: string) {
  if (value === "UTC") {
    return "UTC";
  }

  const parts = value.split("/");
  const city = prettifyTimezoneSegment(parts[parts.length - 1] ?? value);

  if (parts.length > 2) {
    return `${city}, ${prettifyTimezoneSegment(parts[parts.length - 2] ?? "")}`;
  }

  return city;
}

function normalizeOffsetLabel(timeZoneName: string | undefined) {
  if (!timeZoneName || timeZoneName === "GMT" || timeZoneName === "UTC") {
    return "UTC";
  }

  const match = timeZoneName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) {
    return timeZoneName.replace(/^GMT/, "UTC");
  }

  const [, sign, hours, minutes = "00"] = match;
  return `UTC${sign}${hours.padStart(2, "0")}:${minutes}`;
}

function getTimezoneOffsetLabel(value: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      timeZone: value,
      timeZoneName: "shortOffset",
    });
    const timeZoneName = formatter
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return normalizeOffsetLabel(timeZoneName);
  } catch {
    return "UTC";
  }
}

function getTimezonePreviewLabel(value: string, locale?: string) {
  try {
    return new Intl.DateTimeFormat(getLocaleList(locale), {
      hour: "numeric",
      minute: "2-digit",
      timeZone: value,
      weekday: "short",
    }).format(new Date());
  } catch {
    return null;
  }
}

function buildTimezoneLabel(value: string, locale?: string) {
  const metadata = curatedTimezoneMetadata[value];

  if (metadata?.label) {
    return metadata.label;
  }

  if (metadata?.city && metadata.countryCode) {
    const country = getCountryLabel(metadata.countryCode, locale);
    return country ? `${metadata.city}, ${country}` : metadata.city;
  }

  return getFallbackTimezoneLabel(value);
}

function buildTimezoneSearchTokens(
  value: string,
  label: string,
  offsetLabel: string,
) {
  const metadata = curatedTimezoneMetadata[value];
  const tokens = new Set<string>();
  const addToken = (token: string | null | undefined) => {
    if (!token) {
      return;
    }

    const normalized = normalizeSearchText(token);

    if (normalized) {
      tokens.add(normalized);
    }
  };

  addToken(value);
  addToken(label);
  addToken(offsetLabel);
  addToken(offsetLabel.replace("UTC", "GMT"));
  addToken(offsetLabel.replace("UTC", ""));
  addToken(offsetLabel.replace(/[+:]/g, " "));

  for (const alias of metadata?.aliases ?? []) {
    addToken(alias);
  }

  for (const legacyAlias of preferredTimezoneReverseAliases[value] ?? []) {
    addToken(legacyAlias);
  }

  return Array.from(tokens);
}

function buildTimezoneOption(value: string, locale?: string): TimezoneOption {
  const label = buildTimezoneLabel(value, locale);
  const offsetLabel = getTimezoneOffsetLabel(value);

  return {
    label,
    offsetLabel,
    previewLabel: getTimezonePreviewLabel(value, locale),
    rank: curatedTimezoneMetadata[value]?.rank ?? 0,
    searchText: normalizeSearchText([label, value, offsetLabel].join(" ")),
    searchTokens: buildTimezoneSearchTokens(value, label, offsetLabel),
    secondaryLabel: value,
    value,
  };
}

function getSearchScore(option: TimezoneOption, normalizedQuery: string) {
  const queryWords = normalizedQuery
    .split(" ")
    .filter((word) => word.length > 0);
  let bestScore = -1;

  for (const token of option.searchTokens) {
    if (token === normalizedQuery) {
      bestScore = Math.max(bestScore, 50_000);
      continue;
    }

    const tokenWords = token.split(" ").filter((word) => word.length > 0);

    if (tokenWords.some((word) => word === normalizedQuery)) {
      bestScore = Math.max(bestScore, 45_000);
    }

    if (
      queryWords.length > 0 &&
      queryWords.every((queryWord) =>
        tokenWords.some((word) => word.startsWith(queryWord)),
      )
    ) {
      bestScore = Math.max(bestScore, 30_000);
    }

    if (token.startsWith(normalizedQuery)) {
      bestScore = Math.max(bestScore, 25_000);
    }

    if (token.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 10_000);
    }
  }

  if (bestScore < 0) {
    return -1;
  }

  return bestScore + option.rank;
}

function getSuggestionValues(
  selectedValue?: string | null,
  browserTimezone?: string | null,
) {
  const values = [
    normalizeTimezone(selectedValue),
    normalizeTimezone(browserTimezone),
    "UTC",
    ...commonSuggestionTimezones,
  ];

  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

export function normalizeTimezone(value: string | null | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  const preferredValue = getPreferredTimezoneAlias(normalizedValue);

  if (!canFormatTimezone(preferredValue)) {
    return null;
  }

  try {
    const resolvedValue = new Intl.DateTimeFormat("en-US", {
      timeZone: preferredValue,
    }).resolvedOptions().timeZone;
    return getPreferredTimezoneAlias(resolvedValue);
  } catch {
    return preferredValue;
  }
}

export function getSupportedTimezones() {
  if (supportedTimezones) {
    return supportedTimezones;
  }

  const timezones = new Set<string>();

  try {
    for (const timezone of Intl.supportedValuesOf("timeZone")) {
      const normalizedTimezone = normalizeTimezone(timezone);

      if (normalizedTimezone) {
        timezones.add(normalizedTimezone);
      }
    }
  } catch {
    for (const timezone of fallbackTimezones) {
      const normalizedTimezone = normalizeTimezone(timezone);

      if (normalizedTimezone) {
        timezones.add(normalizedTimezone);
      }
    }
  }

  for (const timezone of Object.keys(preferredTimezoneAliases)) {
    const normalizedTimezone = normalizeTimezone(timezone);

    if (normalizedTimezone) {
      timezones.add(normalizedTimezone);
    }
  }

  for (const timezone of Object.values(preferredTimezoneAliases)) {
    const normalizedTimezone = normalizeTimezone(timezone);

    if (normalizedTimezone) {
      timezones.add(normalizedTimezone);
    }
  }

  supportedTimezones = Array.from(timezones).sort((left, right) =>
    left.localeCompare(right),
  );
  return supportedTimezones;
}

export function getTimezoneOptions(locale?: string) {
  const cacheKey = getLocaleList(locale).join("|");
  const cachedOptions = timezoneOptionsCache.get(cacheKey);

  if (cachedOptions) {
    return cachedOptions;
  }

  const options = getSupportedTimezones().map((value) =>
    buildTimezoneOption(value, locale),
  );
  timezoneOptionsCache.set(cacheKey, options);
  return options;
}

export function getTimezoneOption(
  value: string | null | undefined,
  locale?: string,
) {
  const normalizedValue = normalizeTimezone(value);

  if (!normalizedValue) {
    return null;
  }

  return (
    getTimezoneOptions(locale).find(
      (option) => option.value === normalizedValue,
    ) ?? buildTimezoneOption(normalizedValue, locale)
  );
}

export function searchTimezoneOptions(
  query: string,
  {
    browserTimezone,
    limit = 20,
    locale,
    selectedValue,
  }: {
    browserTimezone?: string | null;
    limit?: number;
    locale?: string;
    selectedValue?: string | null;
  } = {},
): TimezoneSearchResult {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return {
      ambiguityHint: null,
      options: getSuggestionValues(selectedValue, browserTimezone)
        .map((value) => getTimezoneOption(value, locale))
        .filter((option): option is TimezoneOption => option !== null)
        .slice(0, limit),
    };
  }

  const results = getTimezoneOptions(locale)
    .map((option) => ({
      option,
      score: getSearchScore(option, normalizedQuery),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.option.label.localeCompare(right.option.label);
    })
    .slice(0, limit)
    .map((entry) => entry.option);

  return {
    ambiguityHint: ambiguousTimezoneAbbreviationHints[normalizedQuery] ?? null,
    options: results,
  };
}

export function isSupportedTimezone(value: string | null | undefined) {
  return normalizeTimezone(value) !== null;
}

export function getBrowserTimeZone() {
  if (typeof Intl === "undefined") {
    return "UTC";
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return normalizeTimezone(timeZone) ?? "UTC";
}
