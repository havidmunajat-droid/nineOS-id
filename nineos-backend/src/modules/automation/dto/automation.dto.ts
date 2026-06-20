import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsBoolean, IsArray, IsObject, IsIn,
} from 'class-validator';

export class CreatePipelineDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() pipeline_type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() n8n_workflow_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() platform_slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdatePipelineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() n8n_workflow_id?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['active', 'paused', 'disabled']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdatePipelineRunDto {
  @ApiProperty({ enum: ['success', 'failed', 'running'] })
  @IsIn(['success', 'failed', 'running']) status: string;
}

export class CreateReportScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() platform_slug?: string;
  @ApiProperty() @IsString() report_type: string;
  @ApiProperty({ example: '0 8 * * 1' }) @IsString() cron_expr: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) recipients: string[];
  @ApiPropertyOptional({ enum: ['json', 'csv', 'html'] })
  @IsOptional() @IsIn(['json', 'csv', 'html']) output_format?: string;
}

export class UpdateReportScheduleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() cron_expr?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() recipients?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() output_format?: string;
}

export class CreateAlertDto {
  @ApiPropertyOptional() @IsOptional() @IsString() platform_slug?: string;
  @ApiProperty() @IsString() alert_type: string;
  @ApiPropertyOptional({ enum: ['info', 'warning', 'critical'] })
  @IsOptional() @IsIn(['info', 'warning', 'critical']) severity?: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() message: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
