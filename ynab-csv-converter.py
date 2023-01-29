import csv
import os
import sys
import unicodedata
from datetime import datetime
from decimal import Decimal


def read_csv(input_csv_path: str) -> list[list[str]]:
    csv_rows: list[list[str]] = []
    with open(input_csv_path, encoding='iso_8859_2') as input_csv_file:
        csv_reader = csv.reader(input_csv_file, delimiter=';')
        for row in csv_reader:
            csv_rows.append(row)
    return csv_rows


def write_csv(input_csv_path: str, finalized_transactions: list[tuple[str, str, Decimal, str]]) -> None:
    input_csv_name = os.path.splitext(input_csv_path)[0]
    output_csv_path = input_csv_name + '-ynab.csv'
    with open(output_csv_path, 'w') as output_csv_file:
        csv_writer = csv.writer(output_csv_file)
        csv_writer.writerow(["Date", "Payee", "Amount", "Memo"])
        for finalized_transaction in finalized_transactions:
            (date, payee, amount, memo) = finalized_transaction
            csv_writer.writerow(
                [date, payee, str(amount) + ' HUF', memo])


def get_finalized_transactions(csv_rows: list[list[str]]) -> list[tuple[str, str, Decimal, str]]:
    first_finalized_transaction_row_i: int | None = None

    for i, row in enumerate(csv_rows):
        if row[0] == 'Könyvelt tételek':
            first_finalized_transaction_row_i = i + 2
            break

    if first_finalized_transaction_row_i is None:
        raise RuntimeError("Cannot find finalized transactions")

    return sorted([map_csv_row_to_finalized_transaction(row) for row in csv_rows[first_finalized_transaction_row_i::] if not all(column == '' for column in row)],
                  key=lambda finalized_transaction: (
                      finalized_transaction[0], abs(finalized_transaction[2])),
                  reverse=True)


def map_csv_row_to_finalized_transaction(csv_row: list[str]) -> tuple[str, str, Decimal, str]:
    type_field, date_1_field, date_2_field, id_field, amount_field, \
        notice_1_field, notice_2_field, *notices_rest = csv_row

    if (type_field == 'Kártyatranzakció'):
        parsed_date = datetime.strptime(notice_1_field.split(' ')[1], '%Y%m%d')
    else:
        parsed_date = datetime.strptime(
            date_1_field.split(',')[0], '%Y.%m.%d.')

    date = datetime.strftime(parsed_date, '%Y-%m-%d')
    payee = notice_2_field
    amount = Decimal(
        unicodedata.normalize('NFKC', amount_field)
        .replace('HUF', '')
        .replace(' ', '')
        .replace(',', '.')
    )
    memo = ', '.join(
        filter(lambda x: x != '', [type_field, notice_1_field] + notices_rest))
    return (date, payee, amount, memo)


def main() -> None:
    input_csv_path: str = sys.argv[1]
    csv_rows: list[list[str]] = read_csv(input_csv_path)
    finalized_transactions: list[tuple[str, str,
                                       Decimal, str]] = get_finalized_transactions(csv_rows)
    write_csv(input_csv_path, finalized_transactions)


main()
