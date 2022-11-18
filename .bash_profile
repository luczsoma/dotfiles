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
    (sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder)
}

# Shortcut for download mp3 from youtube
alias yt2mp3="youtube-dl -x --audio-format mp3 --audio-quality 0"

# DOT to PDF converter
function dot2pdf() {
    for FILE in "$@"; do
        BASENAME=${FILE%.*}
        dot -Tpdf $FILE -o $BASENAME.pdf
    done
}

# DOT to PNG converter
function dot2png() {
    for FILE in "$@"; do
        BASENAME=${FILE%.*}
        dot -Tpng $FILE -o $BASENAME.png
    done
}

function jdk() {
    if [[ $# -eq 0 ]]; then
        /usr/libexec/java_home -V
    elif [[ $# -eq 1 ]]; then
        version=$1
        export JAVA_HOME=$(/usr/libexec/java_home -v "$version")
        java -version
    fi
}

# Handling personal vault
function vault() {
    if [[ $# -ne 1 ]]; then
        echo "Usage:"
        echo "vault o|open"
        echo "vault s|save-and-delete"
        echo "vault d|delete"
        return 1
    fi

    pushd ~/Desktop
    case $1 in
    o | open)
        if [[ ! -d Vault ]]; then
            age --decrypt --output Vault.zip ~/Vault/vault
            unzip -q Vault.zip
        fi
        rm -f Vault.zip
        open Vault
        ;;
    s | save-and-delete)
        if [[ -d Vault ]]; then
            zip --quiet --recurse-paths Vault.zip Vault
            rm -r Vault
            age --encrypt --passphrase --output ~/Vault/vault Vault.zip
        fi
        rm -f Vault.zip
        ;;
    d | delete)
        read -p "Delete Vault without saving? (y/Y) " -n 1
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]
        then
            rm -rf Vault
        fi
        ;;
    esac
    popd
}

function tvconvert() {
    node ~/.dotfiles/tvconvert.mjs "$@"
}

function oraallas() {
    sips --setProperty format jpeg --resampleWidth 1200 *.HEIC --out .
    rm *.HEIC
}

# Adding SSH keys to the agent
ssh-add ~/.ssh/Ganymed_Hermes 2>/dev/null
ssh-add ~/.ssh/GitHub_Hermes 2>/dev/null
ssh-add ~/.ssh/tresorit 2>/dev/null

# Git Completion
source ~/.git-completion.bash

# Add Visual Studio Code (code)
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# Loading NVM and its bash complation
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion


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

# Neo4j
export NEO4J_HOME="/Applications/neo4j-enterprise-4.0.3"

# Homebrew
if [[ $(uname -p) == 'arm' ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
else
    eval "$(/usr/local/Homebrew/bin/brew shellenv)"
fi

###-begin-npm-completion-###
#
# npm command completion script
#
# Installation: npm completion >> ~/.bashrc  (or ~/.zshrc)
# Or, maybe: npm completion > /usr/local/etc/bash_completion.d/npm
#
if type complete &>/dev/null; then
  _npm_completion () {
    local words cword
    if type _get_comp_words_by_ref &>/dev/null; then
      _get_comp_words_by_ref -n = -n @ -n : -w words -i cword
    else
      cword="$COMP_CWORD"
      words=("${COMP_WORDS[@]}")
    fi

    local si="$IFS"
    if ! IFS=$'\n' COMPREPLY=($(COMP_CWORD="$cword" \
                           COMP_LINE="$COMP_LINE" \
                           COMP_POINT="$COMP_POINT" \
                           npm completion -- "${words[@]}" \
                           2>/dev/null)); then
      local ret=$?
      IFS="$si"
      return $ret
    fi
    IFS="$si"
    if type __ltrim_colon_completions &>/dev/null; then
      __ltrim_colon_completions "${words[cword]}"
    fi
  }
  complete -o default -F _npm_completion npm
elif type compdef &>/dev/null; then
  _npm_completion() {
    local si=$IFS
    compadd -- $(COMP_CWORD=$((CURRENT-1)) \
                 COMP_LINE=$BUFFER \
                 COMP_POINT=0 \
                 npm completion -- "${words[@]}" \
                 2>/dev/null)
    IFS=$si
  }
  compdef _npm_completion npm
elif type compctl &>/dev/null; then
  _npm_completion () {
    local cword line point words si
    read -Ac words
    read -cn cword
    let cword-=1
    read -l line
    read -ln point
    si="$IFS"
    if ! IFS=$'\n' reply=($(COMP_CWORD="$cword" \
                       COMP_LINE="$line" \
                       COMP_POINT="$point" \
                       npm completion -- "${words[@]}" \
                       2>/dev/null)); then

      local ret=$?
      IFS="$si"
      return $ret
    fi
    IFS="$si"
  }
  compctl -K _npm_completion npm
fi
###-end-npm-completion-###
