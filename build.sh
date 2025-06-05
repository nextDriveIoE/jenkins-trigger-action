function validate {
    if [ -z "$INPUT_PAYLOAD" ] || [ -z "$INPUT_JENKINS_DOMAIN" ] || [ -z "$INPUT_JENKINS_USER" ] || [ -z "$INPUT_JENKINS_TOKEN" ] || [ -z "$INPUT_JOB_NAME" ]
      then
        echo "Error: Required inputs are missing."
        exit 1
    fi
}


function parse_payload() {
    local payload="$1"
    local -a params=()

    echo "Trigger payload: $payload"

    for row in $(echo "$payload" | jq -c '. | to_entries[]'); do
        local key=$(echo "$row" | jq -r '.key')
        local val=$(echo "$row" | jq -r '.value')
        params+=("-d" "$key=$val")
    done

    echo "Sending with params: ${params[*]}"

    local response_headers=$(mktemp)

    local http_code=$(curl -s -o /dev/null -I -w "%{http_code}" \
        -D "$response_headers" \
        -X POST "$INPUT_JENKINS_DOMAIN/job/$INPUT_JOB_NAME/buildWithParameters" \
        --user "$INPUT_JENKINS_USER:$INPUT_JENKINS_TOKEN" \
        "${params[@]}")

    local location=$(grep -i '^Location:' "$response_headers" | awk '{print $2}' | tr -d '\r')

    rm "$response_headers"

    echo "$http_code;$location"
}

function main {
    validate
    result=$(parse_payload "$INPUT_PAYLOAD")

    echo $result
    local http_code="${result%%;*}"
    local location="${result##*;}"

    if [[ "$http_code" == "201" || "$http_code" == "200" ]]; then
        echo "Jenkins trigger success (HTTP $http_code)"
        if [[ -n "$location" ]]; then
            echo "Build URL: $location"
        else
            echo "Build URL Not Found"
        fi
    else
        echo "Jenkins trigger fail (HTTP $http_code)"
        exit 1
    fi
}

main
# main '{"TAG":"v1.2.3","JOB":true}'

