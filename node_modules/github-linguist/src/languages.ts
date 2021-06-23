import { ExtensionJustify } from './utils';

// tslint:disable-next-line
const languageMap = require('language-map');
// tslint:disable-next-line
// const lang = require('language-classifier');

interface ExtensionsTypes {
  [key: string]: string;
}

export interface DetectorOptions {}

/**
 * The extension map can contain multiple languages with the same extension,
 * but we only want a single one. For the moment, these clashes are resolved
 * by the simple heuristic below listing high-priority languages. We may want
 * to consider smarter heuristics to correctly identify languages in cases
 * where the extension is ambiguous. The ordering of the list matters and
 * languages earlier on will get a higher priority when resolving clashes.
 */
const importantLanguages = ["javascript", "typescript", "ruby", "python", "java", "c", "c++", "c#", "rust", "scala", "perl", "go"];


/**
 * detecte program language through file extension
 *
 * @export
 * @class LanguageDetector
 */
export class Languages {
  extensionMap: {
    [key: string]: string;
  } = {};

  /**
   * Creates an instance of Detector.
   */
  constructor() {
    this.extensionMap = this.loadExtensionMap();
  }

  /**
   * load language before detecting
   */
  private loadExtensionMap = () => {
    const extensions: ExtensionsTypes = {};

    Object.keys(languageMap).forEach((language) => {
      const languageMode = languageMap[language];
      const languageExtensions = (languageMode && languageMode.extensions) || [];
      languageExtensions.forEach((extension: string) => {
        const lowerCaseExtension = extension.toLowerCase();
        const lowerCaseLanguage = language.toLowerCase()
        if (!extensions[lowerCaseExtension]) {
          extensions[lowerCaseExtension] = lowerCaseLanguage;
        } else {
          const currentLanguagePriority = importantLanguages.indexOf(extensions[lowerCaseExtension]);
          if (currentLanguagePriority === -1) {
            extensions[lowerCaseExtension] = lowerCaseLanguage;
          } else {
            const otherPriority = importantLanguages.indexOf(lowerCaseLanguage);
            if (otherPriority !== -1 && otherPriority < currentLanguagePriority)
              extensions[lowerCaseExtension] = lowerCaseLanguage;
          }
        }
      });
    });

    return Object.assign({}, extensions, ExtensionJustify);
  }

  /**
   * Retrieve the regular expressions for a given language.
   * This is incomplete, but covers most of the languages we
   * see in the wild.
   *
   * @param language the language to retrieve regexes for
   */
  public getRegexes(language: string): Regexes {
    switch(language) {
      case 'html':
      case 'xml':
        return ALL_REGEXES.html;

      case 'ruby':
        return ALL_REGEXES.ruby;

      case 'python':
        return ALL_REGEXES.python;

      default:
        // not exact, but likely the best guess for any other unspecified language.
        return ALL_REGEXES.c;
    }
  }

  /**
   * return extension map
   */
  public getExtensionMap() {
    return this.extensionMap;
  }

  /**
   * get file type through a path
   */
   public getType(path: string): string {
    const fileExtension = `.${path.split('.').pop()}`;
    return this.extensionMap[fileExtension] || '';
  }
}

export interface Regexes {
  singleLineComment: RegExp;
  multiLineCommentOpen: RegExp;
  multiLineCommentOpenStart: RegExp;
  multiLineCommentClose: RegExp;
  multiLineCommentCloseEnd: RegExp;
  multiLineCommentOpenAndClose: RegExp;
}

const ALL_REGEXES: Record<string, Regexes> = {
  c: {
    // matches when // are the first two characters of a line
    singleLineComment: /^\/\//,

    // matches when /* exists in a line
    multiLineCommentOpen: /\/\*/,

    // matches when /* starts a line
    multiLineCommentOpenStart: /^\/\*/,

    // matches when */ exists a line
    multiLineCommentClose: /\*\//,

    // matches when */ ends a line
    multiLineCommentCloseEnd: /\*\/$/,

    // matches /* ... */
    multiLineCommentOpenAndClose: /\/\*.*\*\//
  },

  python: {
    // matches when # the first character of a line
    singleLineComment: /^#/,

    // matches when """ starts a line. This is not right, since
    // a multiline string is not always a comment, but for the
    // sake of simplicity, we will do that here.
    multiLineCommentOpen: /"""/,

    // matches when """ starts a line
    multiLineCommentOpenStart: /^"""/,

    // matches when """ exists in a line
    multiLineCommentClose: /"""/,

    // matches when """ ends a line
    multiLineCommentCloseEnd: /"""$/,

    // matches """ ... """
    multiLineCommentOpenAndClose: /""".*"""/
  },

  ruby: {
    // matches when # the first character of a line
    singleLineComment: /^#/,

    // For ruby multiline comments, =begin and =end must be
    // on their own lines

    // matches when =begin starts a line
    multiLineCommentOpen: /^=begin/,

    // matches when "begin starts a line
    multiLineCommentOpenStart: /^=begin/,

    // matches when "end ends a line
    multiLineCommentClose: /^=end/,

    // matches when "end ends a line
    multiLineCommentCloseEnd: /^=end$/,

    // not possible in ruby
    multiLineCommentOpenAndClose: /^\0$/
  },

  html: {
    // There is no single line comment
    singleLineComment: /^\0$/,

    // matches when =begin starts a line
    multiLineCommentOpen: /<!--/,

    // matches when "begin starts a line
    multiLineCommentOpenStart: /^<!--/,

    // matches when "end ends a line
    multiLineCommentClose: /-->/,

    // matches when "end ends a line
    multiLineCommentCloseEnd: /-->$/,

    // matches <!-- ... -->
    multiLineCommentOpenAndClose: /<!--.*-->/
  }
};
