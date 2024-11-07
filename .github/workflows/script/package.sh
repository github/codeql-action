#!/bin/sh
bundle_file() {
    module=$(dirname "$1")
    file=$(perl -ne 'next unless m<'"$2"': .(?:.*/|)(.*\.js)>;print $1' "$1")
    if [ -n "$file" ]; then
        if [ "$2" = main ]; then
            suffix=''
        else
            suffix="-$2"
        fi
        ./node_modules/.bin/esbuild "lib/$module-action$suffix.js" --bundle --minify --platform=node --outfile="./$module/$file"
        perl -pi -e 's/scripts:\{.*?\}/scripts:{}/' "./$module/$file"
    fi
};
for a in */action.yml; do
    bundle_file $a main;
    bundle_file $a post;
done
