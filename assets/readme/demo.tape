# half-fixed demo: scan prism-php/prism for hf-5505660
# Records the published CLI running against prism-php/prism@5d6cc65, the revision before prism-php/prism#1038.
# Requires: VHS (brew install vhs), Node 18+, git
# Usage: vhs demo.tape (from assets/readme)

Output demo-dark.gif

Set FontFamily "JetBrains Mono,SF Mono,Menlo,monospace"
Set FontSize 14
Set Width 920
Set Height 700
Set Padding 16
Set TypingSpeed 50ms
Set Theme "GitHub Dark"
Set WindowBar Colorful
Set WindowBarSize 40
Set CursorBlink false

Set Shell bash

Hide
Type "[ -d /tmp/prism ] || git clone -q https://github.com/prism-php/prism.git /tmp/prism"
Enter
Sleep 20s
Type "cd /tmp/prism && git checkout -q 5d6cc65b80b19cf3f22744703ac0c727b68cdca8"
Enter
Type "npx --yes half-fixed --version > /dev/null 2>&1"
Enter
Sleep 15s
Type "clear"
Enter
Sleep 500ms
Show

Type "npx half-fixed scan --group ToolMap"
Sleep 400ms
Enter

Sleep 3s

Type "# hf-5505660: Groq, Mistral, xAI and Z still had the bug, fixed in prism-php/prism#1038"
Sleep 300ms
Enter

Sleep 5s
