#!/usr/bin/env python3
"""
CSV Processor for Vocabulary Matching Game
Converts CSV files to JSON format for the web application
"""

import csv
import json
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Any


class CSVProcessor:
    def __init__(self):
        self.data = []

    def load_csv(self, csv_file_path: str) -> bool:
        """
        Load and validate CSV file
        Expected format: concept,definition
        """
        try:
            csv_path = Path(csv_file_path)
            if not csv_path.exists():
                print(f"Error: File {csv_file_path} not found")
                return False

            if not csv_path.suffix.lower() == '.csv':
                print(f"Error: {csv_file_path} is not a CSV file")
                return False

            with open(csv_path, 'r', encoding='utf-8') as file:
                # Auto-detect delimiter
                sample = file.read(1024)
                file.seek(0)

                sniffer = csv.Sniffer()
                delimiter = sniffer.sniff(sample).delimiter

                reader = csv.reader(file, delimiter=delimiter)

                # Skip header if it exists
                first_row = next(reader, None)
                if first_row and self._is_header_row(first_row):
                    pass  # Skip header
                else:
                    # First row is data, process it
                    if first_row:
                        self._process_row(first_row, 1)

                # Process remaining rows
                for row_num, row in enumerate(reader, start=2):
                    self._process_row(row, row_num)

            print(f"Successfully loaded {len(self.data)} vocabulary pairs")
            return True

        except Exception as e:
            print(f"Error loading CSV file: {e}")
            return False

    def _is_header_row(self, row: List[str]) -> bool:
        """
        Determine if the first row is a header
        """
        if len(row) < 2:
            return False

        # Common header patterns
        header_patterns = [
            'concept', 'definition', 'term', 'meaning', 'word', 'description',
            'vocabulary', 'explanation', 'phrase', 'translation'
        ]

        first_cell = row[0].lower().strip()
        second_cell = row[1].lower().strip()

        return (first_cell in header_patterns or
                second_cell in header_patterns or
                'concept' in first_cell or
                'definition' in second_cell)

    def _process_row(self, row: List[str], row_num: int) -> None:
        """
        Process a single CSV row
        """
        if len(row) < 2:
            print(f"Warning: Row {row_num} has insufficient columns (need at least 2)")
            return

        concept = row[0].strip()
        definition = row[1].strip()

        if not concept or not definition:
            print(f"Warning: Row {row_num} has empty concept or definition")
            return

        # Check for duplicates
        for existing in self.data:
            if existing['concept'].lower() == concept.lower():
                print(f"Warning: Duplicate concept '{concept}' found at row {row_num}")
                return

        self.data.append({
            'concept': concept,
            'definition': definition
        })

    def validate_data(self) -> bool:
        """
        Validate the loaded data
        """
        if not self.data:
            print("Error: No valid data found")
            return False

        if len(self.data) < 3:
            print("Warning: Very few vocabulary pairs found. Game works best with 5+ pairs")

        # Check for reasonable concept/definition lengths
        for i, item in enumerate(self.data):
            if len(item['concept']) > 100:
                print(f"Warning: Concept at position {i+1} is very long ({len(item['concept'])} chars)")

            if len(item['definition']) > 300:
                print(f"Warning: Definition at position {i+1} is very long ({len(item['definition'])} chars)")

        return True

    def export_json(self, output_path: str) -> bool:
        """
        Export data to JSON format
        """
        try:
            output_file = Path(output_path)

            # Create directory if it doesn't exist
            output_file.parent.mkdir(parents=True, exist_ok=True)

            # Prepare data with metadata
            export_data = {
                'metadata': {
                    'total_pairs': len(self.data),
                    'created_by': 'CSV Processor',
                    'format_version': '1.0'
                },
                'vocabulary_pairs': self.data
            }

            with open(output_file, 'w', encoding='utf-8') as file:
                json.dump(export_data, file, indent=2, ensure_ascii=False)

            print(f"Successfully exported to {output_path}")
            return True

        except Exception as e:
            print(f"Error exporting JSON: {e}")
            return False

    def get_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about the loaded data
        """
        if not self.data:
            return {}

        concept_lengths = [len(item['concept']) for item in self.data]
        definition_lengths = [len(item['definition']) for item in self.data]

        return {
            'total_pairs': len(self.data),
            'avg_concept_length': sum(concept_lengths) / len(concept_lengths),
            'avg_definition_length': sum(definition_lengths) / len(definition_lengths),
            'max_concept_length': max(concept_lengths),
            'max_definition_length': max(definition_lengths),
            'concepts': [item['concept'] for item in self.data[:5]]  # First 5 for preview
        }

    def print_statistics(self) -> None:
        """
        Print statistics about the loaded data
        """
        stats = self.get_statistics()
        if not stats:
            print("No data loaded")
            return

        print("\n" + "="*50)
        print("DATA STATISTICS")
        print("="*50)
        print(f"Total vocabulary pairs: {stats['total_pairs']}")
        print(f"Average concept length: {stats['avg_concept_length']:.1f} characters")
        print(f"Average definition length: {stats['avg_definition_length']:.1f} characters")
        print(f"Longest concept: {stats['max_concept_length']} characters")
        print(f"Longest definition: {stats['max_definition_length']} characters")
        print(f"\nFirst few concepts:")
        for i, concept in enumerate(stats['concepts'], 1):
            print(f"  {i}. {concept}")
        print("="*50)


def main():
    parser = argparse.ArgumentParser(
        description='Process CSV files for Vocabulary Matching Game',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python csv_processor.py input.csv
  python csv_processor.py input.csv -o output.json
  python csv_processor.py input.csv --stats-only

CSV Format:
  concept,definition
  Photosynthesis,"Process by which plants convert sunlight into energy"
  Democracy,"System of government where citizens vote"
        """
    )

    parser.add_argument('input_csv', help='Input CSV file path')
    parser.add_argument('-o', '--output',
                       help='Output JSON file path (default: same name as input with .json extension)')
    parser.add_argument('--stats-only', action='store_true',
                       help='Only show statistics, don\'t create output file')

    args = parser.parse_args()

    # Initialize processor
    processor = CSVProcessor()

    # Load CSV file
    if not processor.load_csv(args.input_csv):
        sys.exit(1)

    # Validate data
    if not processor.validate_data():
        sys.exit(1)

    # Show statistics
    processor.print_statistics()

    # Export if not stats-only
    if not args.stats_only:
        # Determine output path
        if args.output:
            output_path = args.output
        else:
            input_path = Path(args.input_csv)
            output_path = input_path.with_suffix('.json')

        if not processor.export_json(str(output_path)):
            sys.exit(1)

        print(f"\nReady to use with vocabulary matching game!")
        print(f"You can now upload {output_path} to the web application.")


if __name__ == "__main__":
    main()