# ChangeLog

## 2020-09-10 Version 2.1.4
* [[`94b9eb8a2d`](https://github.com/rhalff/dot-object/commit/94b9eb8a2d)] - Fix parsing of array paths for non standard separators (Fixed by boidolr #58)

## 2020-02-16 Version 2.1.3
* fix possible pollution of prototype for paths containing __proto__

## 2019-11-02 Version 2.1.1
* fix undefined key with root level array.

## 2019-11-02 Version 2.1.1
* Wrong array conversion when brackets are used (Reported by vladshcherbin #27)

## 2019-11-02 Version 2.1.0
* fix delete function not being wrapped. (Reported by murphyke #40)

## 2019-11-02 Version 2.0.0
* [[`2cb41bbd1b`](https://github.com/rhalff/dot-object/commit/2cb41bbd1b)] - Add useBrackets option for the .dot() method (by z1m1n #42)
* dot() now writes brackets by default (possibly breaking change).
  Use Dot.useBrackets = false to keep the old behavior

## 2019-07-29 Version 1.9.0
* allows allow to process root level property using dot.object

## 2019-07-18 Version 1.8.1
* always allow to set root level property using dot.str

## 2019-07-18 Version 1.8.0
* [[`cdc691424b`](https://github.com/rhalff/dot-object/commit/cdc691424b)] - Options to remove array elements and reindex the array. (Fixed by MechJosh0 #36)

## 2018-10-26 Version 1.7.1
* [[`e1bb99c83e`](https://github.com/rhalff/dot-object/commit/e1bb99c83e)] - Fix isIndex numeric key matching. (Fixed by mrdivyansh #31)

## 2017-09-20 Version 1.7.0
* let .dot and .object understand empty objects / arrays

## 2017-07-27 Version 1.6.0
* implemented keepArray

## 2016-09-29 Version 1.5.4
* update dist

## 2016-09-29, Version 1.5.3
* Fix override bug in str()

## 2016-08-04, Version 1.5.0
* [[`a7e948f2fa`](https://github.com/rhalff/dot-object/commit/a7e948f2fa)] - Ensure we only process true Arrays and Objects. (Fixed by MechJosh0 #15)

## 2016-02-14, Version 1.4.0
* add transform() method
* use [standard](https://github.com/feross/standard/) style

## 2015-11-17, Version 1.3.1
* [[`e46da6ffc0`](https://github.com/rhalff/dot-object/commit/e46da6ffc0)] - Fix deep array bug. (Reported by ami44 #10)

## 2015-10-01, Version 1.3.0
* [[`baa42022bf`](https://github.com/rhalff/dot-object/commit/baa42022bf)] - Adds a parameter (useArray) to allow converting object without using arrays. (Thomas Moiron)

## 2015-09-07, Version 1.2.0
* allow override even when target is non-empty object
* also return the object when using object() or str()

## 2015-08-08, Version 1.1.0
* Also let .object() understand array notation.

## 2015-08-03, Version 1.0.0
* Convert object to dotted-key/value pairs

## 2015-04-15, Version 0.11.0
* Add support for bracket notation

## 2015-03-22, Version 0.10.0
* Make return value optional for Object/Array modifier(s)
* Add modifier option to move(), transfer() & copy()

## 2015-03-21, Version 0.9.0
* support multiple replacements/deletions (cli)
* add del/remove method
* improve bower build

## 2015-03-09, Version 0.8.1

* [[`679f87590f`](https://github.com/rhalff/dot-object/commit/679f87590f)] - add to bower
* [[`9a026982d8`](https://github.com/rhalff/dot-object/commit/9a026982d8)] - consider amd or attaching to window

## 2015-03-06, Version 0.8.0

* [[`5ce0fe8836`](https://github.com/rhalff/dot-object/commit/5ce0fe8836)] - Simplify API

## 2015-03-06, Version 0.7.0

* [[`c4658c386f`](https://github.com/rhalff/dot-object/commit/c4658c386f)] - Look for properties down in the prototype chain. (Fer Uría)
* [[`a45c4a7982`](https://github.com/rhalff/dot-object/commit/a45c4a7982)] - Fix picking a null property with a dotted value. (Fer Uría)
