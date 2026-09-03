from pathlib import Path

p = Path('android/app/build.gradle')
s = p.read_text()

if 'signingConfigs' not in s:
    block = "\n".join([
        "    signingConfigs {",
        "        release {",
        "            def props = new Properties()",
        "            def propsFile = rootProject.file(\"keystore.properties\")",
        "            if (propsFile.exists()) {",
        "                props.load(new FileInputStream(propsFile))",
        "                storeFile file(props[\"storeFile\"])",
        "                storePassword props[\"storePassword\"]",
        "                keyAlias props[\"keyAlias\"]",
        "                keyPassword props[\"keyPassword\"]",
        "            }",
        "        }",
        "    }"
    ])
    s = s.replace('android {', 'android {' + block, 1)

if 'signingConfig signingConfigs.release' not in s:
    s = s.replace(
        'buildTypes {\n        release {',
        'buildTypes {\n        release {\n            signingConfig signingConfigs.release',
        1,
    )

p.write_text(s)
