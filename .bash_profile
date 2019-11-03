######################
# CUSTOM LS COMMANDS #
######################
# -F displays: / directory, * exec, @ symlink, = socket, % whiteout, | FIFO
# -G enables colorized output
# -h human readable output for sizes
alias ls="ls -FGh"
export CLICOLOR=1
export LSCOLORS=GxFxBxDxCxegedabageced

# Make mv ask before overwriting a file by default
alias mv="mv -i"

# Shortcut for clearing terminal screen
alias clr="clear"

# Fast IP query
alias ip="curl ifconfig.co"

# Shortcut for flushing DNS cache
function flushdns() {
	( sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder )
}

# Shortcut for download mp3 from youtube
alias yt2mp3="youtube-dl -x --audio-format mp3 --audio-quality 0"

# DOT to PDF converter
function dot2pdf() {
	for FILE in "$@"
	do
		BASENAME=${FILE%.*}
		dot -Tpdf $FILE -o $BASENAME.pdf
	done
}

# DOT to PNG converter
function dot2png() {
	for FILE in "$@"
	do
		BASENAME=${FILE%.*}
		dot -Tpng $FILE -o $BASENAME.png
	done
}

# Count lines of code in a GitHub repository
function cloc-github() {
	REPO_NAME=temp-linecount-repo-NN27xTyrk0OdJuQ1RVUc
	git clone --depth 1 "$1" ${REPO_NAME} &&
  cloc ${REPO_NAME} &&
  rm -rf ${REPO_NAME}
}

# Count lines of code in a GitHub repository
function jsfilescount() {
	find ./"$1" -iname "*.js" | wc -l
}

# Calculating password alphabet-related stuff
function pwabc() {
	python -c 'import string
import sys
modulo = 6
if len(sys.argv) == 2:
	char = sys.argv[1]
	if len(char) == 1 and char.isalpha():
		alphabetIndex = string.ascii_lowercase.index(char.lower()) + 1
		result = alphabetIndex % modulo
		number = result if result > 0 else modulo
		print(number)' $1
}

# Handling personal vault
function vault() {
	if [[ $# -ne 1 ]]; then
		exit 1
	fi

	pushd ~/Vault
	case $1 in
		o|open)
			keybase pgp verify --infile vault --detached vault.asc &&
			veracrypt --mount --mount-options=timestamp vault &&
			open /Volumes/VAULT
			;;
		c|close)
			veracrypt --dismount vault &&
			keybase pgp sign --infile vault --detached > vault.asc
			;;
		h|help)
			echo "o|open"
			echo "c|close"
			;;
	esac
	popd
}

# Adding SSH keys to the agent
ssh-add ~/.ssh/Ganymed_Hermes 2> /dev/null
ssh-add ~/.ssh/GitHub_Hermes 2> /dev/null
ssh-add ~/.ssh/tresorit 2> /dev/null

# Git Completion
source ~/.git-completion.bash

# Add Visual Studio Code (code)
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# Loading NVM and its bash complation
export NVM_DIR="$HOME/.nvm"
  [ -s "/usr/local/opt/nvm/nvm.sh" ] && . "/usr/local/opt/nvm/nvm.sh"  # This loads nvm
  [ -s "/usr/local/opt/nvm/etc/bash_completion" ] && . "/usr/local/opt/nvm/etc/bash_completion"  # This loads nvm bash_completion

# Loading pyenv
if command -v pyenv 1>/dev/null 2>&1; then
  eval "$(pyenv init -)"
fi

#########################
# ENVIRONMENT VARIABLES #
#########################

# Fixing perl warning about missing locale settings
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

# hunspell dictionary settings
export DICTIONARY=hu_HU
export DICPATH=~/projects/magyarispell/hu_HU

export JAVA_HOME=$(/usr/libexec/java_home)

# OpenSSL 1.1 instead of the OS default LibreSSL
export PATH="/usr/local/opt/openssl@1.1/bin:$PATH"

# GetText
export PATH="/usr/local/opt/gettext/bin:$PATH"

# Hide Catalina message about the default shell being zsh
export BASH_SILENCE_DEPRECATION_WARNING=1
